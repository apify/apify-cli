const { ApifyClient } = require('apify-client');
const mime = require('mime');
const { default: ow } = require('ow');
const { ApifyStorageLocal } = require('@apify/storage-local');
const { ENV_VARS, KEY_VALUE_STORE_KEYS } = require('@apify/consts');
const { getLocalUserInfo } = require('./utils');

const APIFY_LOCAL_DEFAULT_STORE_ID = 'default';
const APIFY_STORE_TYPES = {
    KEY_VALUE_STORE: 'KEY_VALUE_STORE',
    DATASET: 'DATASET',
    REQUEST_QUEUE: 'REQUEST_QUEUE',
}

/**
 * Returns instance of ApifyClient or ApifyStorageLocal based on environment variables.
 * @param options - ApifyClient options
 * @param forceCloud - If true then ApifyClient will be returned.
 * @return {ApifyStorageLocal|ApifyClient}
 */
const getApifyStorageClient = (options = {}, forceCloud = false) => {
    const storageDir = process.env[ENV_VARS.LOCAL_STORAGE_DIR];

    if (storageDir && !forceCloud) {
        // TODO: APIFY_LOCAL_STORAGE_ENABLE_WAL_MODE is not in shared const.
        const enableWalMode = !!process.env.APIFY_LOCAL_STORAGE_ENABLE_WAL_MODE;
        return new ApifyStorageLocal({
            storageDir,
            enableWalMode,
            ...options,
        });
    }

    // NOTE: Token in env var overrides token in local auth file.
    let apifyToken = process.env[ENV_VARS.TOKEN];
    if (!apifyToken) {
        const localUserInfo = getLocalUserInfo();
        if (!localUserInfo || !localUserInfo.token) {
            throw new Error('Apify token is not set. Please set it using the environment variable APIFY_TOKEN or apify login command.');
        }
        apifyToken = localUserInfo.token;
    }

    return new ApifyClient({
        token: apifyToken,
        ...options,
    });
};

/**
 * Returns default storage id based on environment variables.
 * Throws error if not set and actor running on platform.
 * @param storeType
 * @return {string}
 */
const getDefaultStorageId = (storeType) => {
    const envVarName = ENV_VARS[`DEFAULT_${storeType}_ID`];
    const storeId = process.env[envVarName];
    // If actor running on platform throw error if storage id is not set.
    if (!storeId && !process.env[ENV_VARS.LOCAL_STORAGE_DIR]) {
        throw new Error(`Storage ID is not set. Please set it using the environment variable ${envVarName}.`);
    }
    return storeId || APIFY_LOCAL_DEFAULT_STORE_ID;
};

/**
 * Outputs value of record into standard output of the command.
 * @param {string} key - Record key
 * @return {Promise<void>}
 */
const outputRecordFromDefaultStore = async (key) => {
    ow(key, ow.string);

    const apifyClient = getApifyStorageClient();
    const defaultStoreId = getDefaultStorageId(APIFY_STORE_TYPES.KEY_VALUE_STORE);
    const record = await apifyClient.keyValueStore(defaultStoreId).getRecord(key);
    // If record does not exist return empty string.
    if (!record) return;
    // TODO: Value can be any file or string, so we should print it in a readable way based on its type.
    if (mime.getExtension(record.contentType) !== 'json') throw new Error(`Value for INPUT is not a JSON, it is ${record.contentType}.`);

    console.log(JSON.stringify(record.value));
};

const outputInputFromDefaultStore = async () => {
    return outputRecordFromDefaultStore(process.env[ENV_VARS.INPUT_KEY] || KEY_VALUE_STORE_KEYS.INPUT);
};

module.exports = {
    outputRecordFromDefaultStore,
    outputInputFromDefaultStore,
    getApifyStorageClient,
    getDefaultStorageId,
    APIFY_STORE_TYPES,
};
