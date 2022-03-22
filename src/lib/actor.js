const { ApifyClient } = require('apify-client');
const mime = require('mime');
const ow = require('ow');
const { ApifyStorageLocal } = require('@apify/storage-local');
const { ENV_VARS, KEY_VALUE_STORE_KEYS } = require('@apify/consts');

/**
 * Returns instance of ApifyClient or ApifyStorageLocal based on environment variables.
 * @param options
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

    if (!process.env[ENV_VARS.TOKEN]) {
        throw new Error('Apify token is not set. Please set it using the environment variable APIFY_TOKEN.');
    }

    return new ApifyClient({
        token: process.env[ENV_VARS.TOKEN],
        ...options,
    });
};

const getDefaultStoreId = () => {
    return process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID] || 'default';
};

/**
 * Outputs value of record into standard output of the command.
 * @param {string} key - Record key
 * @return {Promise<void>}
 */
const outputRecordFromDefaultStore = async (key) => {
    ow(key, ow.string);

    const apifyClient = getApifyStorageClient();
    const defaultStoreId = getDefaultStoreId();
    const record = await apifyClient.keyValueStore(defaultStoreId).getRecord(key);
    // If record does not exist return empty string.
    if (!record) return;
    // TODO: Value can be anything, so we should print it in a readable way based on its type.
    if (mime.getExtension(record.contentType) !== 'json') throw new Error(`Value for INPUT is not a JSON, it is ${record.contentType}.`);

    console.log(record.value);
}

const outputInputFromDefaultStore = async () => {
    return outputRecordFromDefaultStore(process.env[ENV_VARS.INPUT_KEY] || KEY_VALUE_STORE_KEYS.INPUT)
}

module.exports = {
    outputRecordFromDefaultStore,
    outputInputFromDefaultStore,
};
