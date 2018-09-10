const path = require('path');
const fs = require('fs');
const mime = require('mime');
const globby = require('globby');
const archiver = require('archiver-promise');
const loadJson = require('load-json-file');
const writeJson = require('write-json-file');
const { LOCAL_STORAGE_SUBDIRS, ENV_VARS, LOCAL_ENV_VARS } = require('apify-shared/consts');
const https = require('https');
const ApifyClient = require('apify-client');
const { warning } = require('./outputs');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH, LOCAL_CONFIG_NAME, INPUT_FILE_REG_EXP, DEFAULT_LOCAL_STORAGE_DIR } = require('./consts');
const { ensureFolderExistsSync, rimrafPromised, deleteFile } = require('./files');
const { spawnSync } = require('child_process');
const semver = require('semver');
const isOnline = require('is-online');

const getLocalStorageDir = () => {
    const envVar = ENV_VARS.LOCAL_STORAGE_DIR;

    return process.env[envVar] || DEFAULT_LOCAL_STORAGE_DIR;
};
const getLocalKeyValueStorePath = (storeId) => {
    const envVar = ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID;
    const storeDir = storeId || process.env[envVar] || LOCAL_ENV_VARS[envVar];

    return path.join(getLocalStorageDir(), LOCAL_STORAGE_SUBDIRS.keyValueStores, storeDir);
};
const getLocalDatasetPath = (storeId) => {
    const envVar = ENV_VARS.DEFAULT_DATASET_ID;
    const storeDir = storeId || process.env[envVar] || LOCAL_ENV_VARS[envVar];

    return path.join(getLocalStorageDir(), LOCAL_STORAGE_SUBDIRS.datasets, storeDir);
};
const getLocalRequestQueuePath = (storeId) => {
    const envVar = ENV_VARS.DEFAULT_REQUEST_QUEUE_ID;
    const storeDir = storeId || process.env[envVar] || LOCAL_ENV_VARS[envVar];

    return path.join(getLocalStorageDir(), LOCAL_STORAGE_SUBDIRS.requestQueues, storeDir);
};

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
    ensureFolderExistsSync(actDir, getLocalDatasetPath());
    ensureFolderExistsSync(actDir, getLocalRequestQueuePath());
    ensureFolderExistsSync(actDir, getLocalKeyValueStorePath());

    // Update gitignore
    const localStorageDir = getLocalStorageDir();
    const gitingore = path.join(actDir, '.gitignore');
    if (fs.existsSync(gitingore)) {
        fs.writeFileSync(gitingore, `\n${localStorageDir}`, { flag: 'a' });
    } else {
        fs.writeFileSync(gitingore, `${localStorageDir}\nnode_modules`, { flag: 'w' });
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
 * Create zip file with all actor files in current directory, omit files defined in .gitignore and ignore .git folder.
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
 * Get actor input from local store
 * @return {{body: *, contentType: string}}
 */
const getLocalInput = () => {
    const defaultLocalStorePath = getLocalKeyValueStorePath();
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
 * Check'll run approximately every 10. call
 * @return {Promise<void>}
 */
const checkLatestVersion = async () => {
    try {
        // Run check approximately every 10. call
        if (Math.random() <= 0.9) return;
        // Skip if user is offline
        if (!await isOnline({ timeout: 500 })) return;

        const latestVersion = spawnSync('npm', ['view', 'apify-cli', 'version']).stdout.toString().trim();
        const currentVersion = require('../../package.json').version; //  eslint-disable-line

        if (semver.gt(latestVersion, currentVersion)) {
            warning('You are using an old version of apify-cli. Run "npm update apify-cli -g" to install the latest version.');
        }
    } catch (err) {
        // Check should not break all commands
    }
};

const purgeDefaultQueue = async () => {
    const defaultQueuesPath = getLocalRequestQueuePath();
    if (fs.existsSync(defaultQueuesPath)) {
        await rimrafPromised(defaultQueuesPath);
    }
};

const purgeDefaultDataset = async () => {
    const defaultDatasetPath = getLocalDatasetPath();
    if (fs.existsSync(defaultDatasetPath)) {
        await rimrafPromised(defaultDatasetPath);
    }
};

const purgeDefaultKeyValueStore = async () => {
    const defaultKeyValueStorePath = getLocalKeyValueStorePath();
    const filesToDelete = fs.readdirSync(defaultKeyValueStorePath);

    const deletePromises = [];
    filesToDelete.forEach((file) => {
        if (!file.match(INPUT_FILE_REG_EXP)) deletePromises.push(deleteFile(path.join(defaultKeyValueStorePath, file)));
    });

    await Promise.all(deletePromises);
};

const outputLogStream = (logId, timeout) => {
    return new Promise((resolve, reject) => {
        const req = https.get(`https://api.apify.com/v2/logs/${logId}?stream=1`);
        let res;

        req.on('response', (response) => {
            res = response;
            response.on('data', chunk => console.log(chunk.toString().trim()));
            response.on('error', (err) => {
                reject(err);
            });
        });
        req.on('error', (err) => {
            reject(err);
        });
        req.on('close', () => {
            resolve('finished');
        });

        if (timeout) {
            setTimeout(() => {
                if (res) res.removeAllListeners();
                if (req) {
                    req.removeAllListeners();
                    req.abort();
                }
                resolve('timeouts');
            }, timeout);
        }
    });
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
    purgeDefaultQueue,
    purgeDefaultDataset,
    purgeDefaultKeyValueStore,
    outputLogStream,
    getLocalKeyValueStorePath,
    getLocalDatasetPath,
    getLocalRequestQueuePath,
};
