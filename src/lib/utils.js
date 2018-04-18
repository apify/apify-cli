const path = require('path');
const fs = require('fs');
const mime = require('mime')
const globby = require('globby');
const archiver = require('archiver-promise');
const loadJson = require('load-json-file');
const writeJson = require('write-json-file');
const ApifyClient = require('apify-client');
const { error, warning } = require('./outputs');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH,
    LOCAL_CONFIG_NAME, DEFAULT_LOCAL_STORES_ID, INPUT_FILE_REG_EXP } = require('./consts');
const { LOCAL_EMULATION_SUBDIRS, DEFAULT_LOCAL_EMULATION_DIR } = require('apify-shared/consts');
const { createFolderSync, updateLocalJson } = require('./files');
const { spawnSync } = require('child_process');
const semver = require('semver');
const isOnline = require('is-online');

/**
 * Returns object from auth file or empty object.
 * @return {*}
 */
const getLocalUserInfo = () => {
    try {
        return loadJson.sync(AUTH_FILE_PATH) || {};
    } catch (e) {
        return {};
    }
};

/**
 * Gets instance of ApifyClient for user otherwise throws error
 * @return {Promise<boolean|*>}
 */
const getLoggedClientOrThrow = async () => {
    const loggedClient = await getLoggedClient();
    if (!loggedClient) {
        throw new Error('You are not logged in with your Apify account. Call "apify login" to fix that.');
    }
    return loggedClient;
};

/**
 * Gets instance of ApifyClient for token or for params from global auth file.
 * NOTE: It refreshes global auth file each run
 * @param [token]
 * @return {Promise<*>}
 */
const getLoggedClient = async (token) => {
    let userInfo;
    const apifyClient = new ApifyClient();

    if (!token && fs.existsSync(GLOBAL_CONFIGS_FOLDER) && fs.existsSync(AUTH_FILE_PATH)) {
        ({ token } = loadJson.sync(AUTH_FILE_PATH));
    }

    try {
        userInfo = await apifyClient.users.getUser({ token });
    } catch (e) {
        return false;
    }

    // Always refresh Auth file
    if (!fs.existsSync(GLOBAL_CONFIGS_FOLDER)) fs.mkdirSync(GLOBAL_CONFIGS_FOLDER);
    writeJson.sync(AUTH_FILE_PATH, Object.assign({ token }, userInfo));
    apifyClient.setOptions({ token, userId: userInfo.id });
    return apifyClient;
};

const getLocalConfig = () => {
    const localConfigPath = path.join(process.cwd(), LOCAL_CONFIG_NAME);
    if (!fs.existsSync(localConfigPath)) {
        return;
    }
    return loadJson.sync(localConfigPath);
};

const getLocalConfigOrThrow = () => {
    const localConfig = getLocalConfig();
    if (!localConfig) {
        throw new Error('apify.json is missing in current dir! Call "apify init" to create it.');
    }
    return localConfig;
};

const setLocalConfig = async (localConfig, actDir) => {
    actDir = actDir || process.cwd();
    writeJson.sync(path.join(actDir, LOCAL_CONFIG_NAME), localConfig);
};


const setLocalEnv = async (actDir) => {
    // Create folders for emulation Apify stores
    const localDir = createFolderSync(path.join(actDir, DEFAULT_LOCAL_EMULATION_DIR));
    const datasetsDir = createFolderSync(path.join(localDir, LOCAL_EMULATION_SUBDIRS.datasets));
    const requestQueuesDir = createFolderSync(path.join(localDir, LOCAL_EMULATION_SUBDIRS.keyValueStores));
    const keyValueStoresDir = createFolderSync(path.join(localDir, LOCAL_EMULATION_SUBDIRS.requestQueues));
    createFolderSync(path.join(datasetsDir, DEFAULT_LOCAL_STORES_ID));
    createFolderSync(path.join(requestQueuesDir, DEFAULT_LOCAL_STORES_ID));
    createFolderSync(path.join(keyValueStoresDir, DEFAULT_LOCAL_STORES_ID));

    // Update gitignore
    const gitingore = path.join(actDir, '.gitignore');
    if (fs.existsSync(gitingore)) {
        fs.writeFileSync(gitingore, DEFAULT_LOCAL_EMULATION_DIR, { flag: 'a' });
    } else {
        fs.writeFileSync(gitingore, `${DEFAULT_LOCAL_EMULATION_DIR}\nnode_modules`, { flag: 'w' });
    }
};

/**
 * Convert Object with kebab-case keys to camelCased keys
 *
 * @param object
 * @return {{}}
 */
const argsToCamelCase = (object) => {
    const camelCasedObject = {};
    Object.keys(object).forEach((arg) => {
        const camelCasedArg = arg.replace(/-(.)/g, $1 => $1.toUpperCase()).replace(/-/g, '');
        camelCasedObject[camelCasedArg] = object[arg];
    });
    return camelCasedObject;
};

/**
 * Create zip file with all act files in current directory, omit files defined in .gitignore and ignore .git folder.
 * NOTE: Zips .file files and .folder/ folders
 * @param zipName
 * @return {Promise<void>}
 */
const createActZip = async (zipName) => {
    const pathsToZip = await globby(['*', '**/**'], { ignore: ['.git/**'], gitignore: true, dot: true });

    const archive = archiver(zipName);

    const archiveFilesPromises = [];
    pathsToZip.forEach(globPath => archiveFilesPromises.push(archive.glob(globPath)));
    await Promise.all(archiveFilesPromises);

    await archive.finalize();
};

/**
 * Get act imput from local store
 * @return {{body: *, contentType: string}}
 */
const getLocalInput = () => {
    const defaultLocalStorePath = path.join(process.cwd(), DEFAULT_LOCAL_EMULATION_DIR,
        LOCAL_EMULATION_SUBDIRS.keyValueStores, DEFAULT_LOCAL_STORES_ID);
    const files = fs.readdirSync(defaultLocalStorePath);
    const inputFileName = files.find(file => !!file.match(INPUT_FILE_REG_EXP));

    // No input file
    if (!inputFileName) return;

    const inputFile = fs.readFileSync(path.join(defaultLocalStorePath, inputFileName));
    const contentType = mime.getType(inputFileName);
    return { body: inputFile, contentType };
};

/**
 * Logs warning if client local package is not in the latest version
 * Check'll be skip if user is offline
 * @return {Promise<void>}
 */
const checkLatestVersion = async () => {
    try {
        // Skip if user is offline
        if (!await isOnline({ timeout: 1000 })) return;

        const latestVersion = spawnSync('npm', ['view', 'apify-cli', 'version']).stdout.toString().trim();
        const currentVersion = require('../../package.json').version;

        if (semver.gt(latestVersion, currentVersion)) {
            warning('You are using old version of apify-cli. Run "npm run apify-cli -g" to install the latest version.');
        }
    } catch (err) {
        // Check should not break all commands
    }
};

module.exports = {
    getLoggedClientOrThrow,
    getLocalConfig,
    setLocalConfig,
    setLocalEnv,
    argsToCamelCase,
    getLoggedClient,
    createActZip,
    getLocalUserInfo,
    getLocalConfigOrThrow,
    checkLatestVersion,
    getLocalInput,
};
