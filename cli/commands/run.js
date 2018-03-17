const { getLocalConfig } = require('../lib/utils');
const execWithLog = require('../lib/exec');
const { APIFY_LOCAL_EMULATION_DIR, APIFY_DEFAULT_DATASET_ID, APIFY_DEFAULT_KEY_VALUE_STORE_ID } = require('../lib/consts');

module.exports = async (args) => {
    const localConfig = await getLocalConfig();
    const cmd = `APIFY_LOCAL_EMULATION_DIR=./${APIFY_LOCAL_EMULATION_DIR} APIFY_DEFAULT_KEY_VALUE_STORE_ID=${APIFY_DEFAULT_KEY_VALUE_STORE_ID} APIFY_DEFAULT_DATASET_ID=${APIFY_DEFAULT_DATASET_ID} node main.js`;
    await execWithLog(cmd);
};
