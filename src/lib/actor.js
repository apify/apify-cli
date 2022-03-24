const { ApifyClient } = require('apify-client');
const { pipeline } = require('stream');
const { promisify } = require('util');
const { default: ow } = require('ow');
const { ApifyStorageLocal } = require('@apify/storage-local');
const { ENV_VARS, LOCAL_ENV_VARS, KEY_VALUE_STORE_KEYS } = require('@apify/consts');
const { getLocalUserInfo } = require('./utils');

const pipelinePromise = promisify(pipeline);

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

const getDefaultStoreId = () => {
    const isRunningOnApify = !process.env[ENV_VARS.LOCAL_STORAGE_DIR];
    const defaultKvsIdEnvVar = ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID;
    if (isRunningOnApify) {
        return process.env[defaultKvsIdEnvVar];
    }

    return process.env[defaultKvsIdEnvVar] || LOCAL_ENV_VARS[defaultKvsIdEnvVar];
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
    const record = await apifyClient.keyValueStore(defaultStoreId).getRecord(key, { stream: true });
    // If record does not exist return empty string.
    if (!record) return;

    await pipelinePromise(record.value, process.stdout);
};

const outputInputFromDefaultStore = async () => {
    return outputRecordFromDefaultStore(process.env[ENV_VARS.INPUT_KEY] || KEY_VALUE_STORE_KEYS.INPUT);
};

module.exports = {
    outputRecordFromDefaultStore,
    outputInputFromDefaultStore,
    getApifyStorageClient,
    getDefaultStoreId,
};
