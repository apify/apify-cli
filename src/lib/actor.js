const { ApifyClient } = require('apify-client');
const { pipeline } = require('stream');
const { promisify } = require('util');
const { default: ow } = require('ow');
const { MemoryStorage } = require('@crawlee/memory-storage');
const { ACTOR_ENV_VARS, LOCAL_ACTOR_ENV_VARS, APIFY_ENV_VARS, KEY_VALUE_STORE_KEYS } = require('@apify/consts');
const { getLocalUserInfo, getLocalStorageDir, getApifyClientOptions } = require('./utils');

const pipelinePromise = promisify(pipeline);

const APIFY_STORAGE_TYPES = {
    KEY_VALUE_STORE: 'KEY_VALUE_STORE',
    DATASET: 'DATASET',
    REQUEST_QUEUE: 'REQUEST_QUEUE',
};

/**
 * Returns instance of ApifyClient or ApifyStorageLocal based on environment variables.
 * @param options - ApifyClient options
 * @param forceCloud - If true then ApifyClient will be returned.
 * @return {MemoryStorage|ApifyClient}
 */
const getApifyStorageClient = (options = {}, forceCloud = false) => {
    const storageDir = getLocalStorageDir();

    if (storageDir && !forceCloud) {
        return new MemoryStorage({
            storageDir,
            ...options,
        });
    }

    // NOTE: Token in env var overrides token in local auth file.
    let apifyToken = process.env[APIFY_ENV_VARS.TOKEN];
    if (!apifyToken) {
        const localUserInfo = getLocalUserInfo();
        if (!localUserInfo || !localUserInfo.token) {
            throw new Error('Apify token is not set. Please set it using the environment variable APIFY_TOKEN or apify login command.');
        }
        apifyToken = localUserInfo.token;
    }

    return new ApifyClient({
        ...getApifyClientOptions(apifyToken),
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
    const isRunningOnApify = !process.env[APIFY_ENV_VARS.LOCAL_STORAGE_DIR]; // TODO: wtf is this??? we have "IS_AT_HOME"...
    const envVarName = ACTOR_ENV_VARS[`DEFAULT_${storeType}_ID`];
    const storeId = process.env[envVarName];
    if (isRunningOnApify && !storeId) { // TODO: this condition means it wil complain when running in the cloud? wtf?
        throw new Error(`Default storage ID is not set. You can set it using the environment `
        + `variable ${envVarName} or use local storage with setting ${APIFY_ENV_VARS.LOCAL_STORAGE_DIR} variable.`);
    }

    return storeId || LOCAL_ACTOR_ENV_VARS[envVarName];
};

/**
 * Outputs value of record into standard output of the command.
 * @param {string} key - Record key
 * @return {Promise<void>}
 */
const outputRecordFromDefaultStore = async (key) => {
    ow(key, ow.string);

    const apifyClient = getApifyStorageClient();
    const defaultStoreId = getDefaultStorageId(APIFY_STORAGE_TYPES.KEY_VALUE_STORE);
    const record = await apifyClient.keyValueStore(defaultStoreId).getRecord(key, { stream: true });
    // If record does not exist return empty string.
    if (!record) return;

    await pipelinePromise(record.value, process.stdout);
};

const outputInputFromDefaultStore = async () => {
    return outputRecordFromDefaultStore(process.env[ACTOR_ENV_VARS.INPUT_KEY] || KEY_VALUE_STORE_KEYS.INPUT);
};

module.exports = {
    outputRecordFromDefaultStore,
    outputInputFromDefaultStore,
    getApifyStorageClient,
    getDefaultStorageId,
    APIFY_STORAGE_TYPES,
};
