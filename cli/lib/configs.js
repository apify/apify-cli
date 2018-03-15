const os = require('os');
const path = require('path');
const fs = require('fs');
const loadJSON = require('load-json-file');
const writeJSON = require('write-json-file');
const ApifyClient = require('apify-client');
const { error } = require('./outputs');
const { APIFY_LOCAL_EMULATION_DIR, APIFY_DEFAULT_DATASET_ID, APIFY_DEFAULT_KEY_VALUE_STORE_ID } = require('./consts');
const { createFolderSync, updateLocalJSON } = require('./misc');

const GLOBAL_CONFIGS_FOLDER = path.join(os.homedir(), '.apify');
const AUTH_FILE_PATH = path.join(GLOBAL_CONFIGS_FOLDER, 'auth.json');
const LOCAL_CONFIG_NAME = 'apify.json';

const getLoggedClientOrError = async () => {
    if (!fs.existsSync(GLOBAL_CONFIGS_FOLDER) || !fs.existsSync(AUTH_FILE_PATH)) {
        error('You aren\'t logged call "apify login" to process login.');
        return;
    }
    const auth = loadJSON.sync(AUTH_FILE_PATH);
    const loggedClient = await getLoggedClient(auth);
    if (!loggedClient) {
        error('You aren\'t logged call "apify login" to process login.');
        return;
    }
    return loggedClient;
};

const setLocalCredentials = async (token, userId) => {
    if (!fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
        fs.mkdirSync(GLOBAL_CONFIGS_FOLDER);
    }
    const auth = {
        token,
        userId
    };
    const isUserLogged = await getLoggedClient(auth);
    if (isUserLogged) {
        writeJSON.sync(AUTH_FILE_PATH, auth);
    } else {
        error('Logging into Apify failed, token or userId is not correct.');
    }
};

const getLoggedClient = async (auth) => {
    try {
        const apifiClient = new ApifyClient(auth);
        await apifiClient.crawlers.listCrawlers();
        return apifiClient;
    } catch (e) {
        return false;
    }
};

const removeGlobalConfig = async () => {
    fs.rmdirSync(GLOBAL_CONFIGS_FOLDER)
};

const getLocalConfig = async () => {
    const localConfigPath = path.join(process.cwd(), LOCAL_CONFIG_NAME);
    if (!fs.existsSync(localConfigPath)) {
        error('apify.json is missing in current dir! Call "apify init" to create it.');
        return;
    }
    return loadJSON.sync(localConfigPath);
};

const setLocalConfig = async (localConfig, actDir) => {
    actDir = actDir || process.cwd();
    writeJSON.sync(path.join(actDir, LOCAL_CONFIG_NAME), localConfig);
};

const setLocalEnv = async (actDir) => {
    // Create folders for emulation Apify stores
    const localDir = createFolderSync(path.join(actDir, APIFY_LOCAL_EMULATION_DIR));
    const datasetsDir = createFolderSync(path.join(localDir, 'datasets'));
    const keyValueStoresDir = createFolderSync(path.join(localDir, 'key-value-stores'));
    createFolderSync(path.join(datasetsDir, APIFY_DEFAULT_DATASET_ID));
    createFolderSync(path.join(keyValueStoresDir, APIFY_DEFAULT_KEY_VALUE_STORE_ID));

    // Update gitignore
    const gitingore = path.join(actDir, '.gitignore');
    if (fs.existsSync(gitingore)) {
        fs.writeFileSync(gitingore, APIFY_LOCAL_EMULATION_DIR, { flag: 'a' });
    }

    // Update package.json
    const packageJson = path.join(actDir, 'package.json');
    if (fs.existsSync(packageJson)) {
        await updateLocalJSON(packageJson, {
                'run-local': `APIFY_LOCAL_EMULATION_DIR=./${APIFY_LOCAL_EMULATION_DIR} APIFY_DEFAULT_KEY_VALUE_STORE_ID=${APIFY_DEFAULT_KEY_VALUE_STORE_ID} APIFY_DEFAULT_DATASET_ID=${APIFY_DEFAULT_DATASET_ID} node main.js`,
            }, 'scripts');
    }
};

module.exports = {
    getLoggedClientOrError,
    setLocalCredentials,
    removeGlobalConfig,
    getLocalConfig,
    setLocalConfig,
    setLocalEnv,
};
