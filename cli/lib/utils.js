const path = require('path');
const fs = require('fs');
const gitignore = require('parse-gitignore');
const globby = require('globby');
const archiver = require('archiver-promise');
const loadJson = require('load-json-file');
const writeJson = require('write-json-file');
const ApifyClient = require('apify-client');
const { error } = require('./outputs');
const { LOCAL_ENV_VARS, GLOBAL_CONFIGS_FOLDER,
    AUTH_FILE_PATH, LOCAL_CONFIG_NAME } = require('./consts');
const { createFolderSync, updateLocalJson } = require('./files');

const apifyClient = new ApifyClient();

/**
 * Gets instance of ApifyClient for user otherwise throws error
 * @return {Promise<boolean|*>}
 */
const getLoggedClientOrError = async () => {
    // TODO: getLoggedClientOrThrow
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
    apifyClient.setOptions({ token, userId: userInfo.userId });

    return apifyClient;
};

const getLocalConfig = async () => {
    const localConfigPath = path.join(process.cwd(), LOCAL_CONFIG_NAME);
    if (!fs.existsSync(localConfigPath)) {
        error('apify.json is missing in current dir! Call "apify init" to create it.');
        return;
    }
    return loadJson.sync(localConfigPath);
};

const setLocalConfig = async (localConfig, actDir) => {
    actDir = actDir || process.cwd();
    writeJson.sync(path.join(actDir, LOCAL_CONFIG_NAME), localConfig);
};


const setLocalEnv = async (actDir) => {
    // Create folders for emulation Apify stores
    const localDir = createFolderSync(path.join(actDir, LOCAL_ENV_VARS.APIFY_LOCAL_EMULATION_DIR));
    const datasetsDir = createFolderSync(path.join(localDir, LOCAL_ENV_VARS.APIFY_LOCAL_DATASETS_DIR));
    const keyValueStoresDir = createFolderSync(path.join(localDir, LOCAL_ENV_VARS.APIFY_LOCAL_KEY_VALUE_STORES_DIR));
    createFolderSync(path.join(datasetsDir, LOCAL_ENV_VARS.APIFY_DEFAULT_DATASET_ID));
    createFolderSync(path.join(keyValueStoresDir, LOCAL_ENV_VARS.APIFY_DEFAULT_KEY_VALUE_STORE_ID));

    // Update gitignore
    const gitingore = path.join(actDir, '.gitignore');
    if (fs.existsSync(gitingore)) {
        fs.writeFileSync(gitingore, LOCAL_ENV_VARS.APIFY_LOCAL_EMULATION_DIR, { flag: 'a' });
    }

    // Update package.json
    const packageJson = path.join(actDir, 'package.json');
    if (fs.existsSync(packageJson)) {
        const envVarsPart = Object.keys(LOCAL_ENV_VARS).map(envVar => `${envVar}=${LOCAL_ENV_VARS[envVar]}`).join(' ');
        const runLocalCmd = `${envVarsPart} node main.js`;
        await updateLocalJson(packageJson, {
            'run-local': runLocalCmd,
        }, 'scripts');
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
 * Create zip file with all act files, omit files defined in .gitignore
 * @param zipName
 * @return {Promise<void>}
 */
const createActZip = async (zipName) => {
    const excludedPaths = gitignore('.gitignore').map(patern => `!${patern}`);
    const pathsToZip = await globby(['*', '*/**', ...excludedPaths]);
    const archive = archiver(zipName);
    const archiveFilesPromises = [];
    pathsToZip.forEach(globPath => archiveFilesPromises.push(archive.glob(globPath)));
    await Promise.all(archiveFilesPromises);
    await archive.finalize();
};

module.exports = {
    getLoggedClientOrError,
    getLocalConfig,
    setLocalConfig,
    setLocalEnv,
    argsToCamelCase,
    getLoggedClient,
    createActZip,
    apifyClient,
};
