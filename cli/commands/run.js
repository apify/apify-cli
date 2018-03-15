const { getLocalConfig } = require('../utils/configs');
const execWithLog = require('../utils/exec');
const { APIFY_LOCAL_EMULATION_DIR, APIFY_DEFAULT_DATASET_ID, APIFY_DEFAULT_KEY_VALUE_STORE_ID } = require('../utils/consts');

module.exports = async (args) => {
    const localConfig = await getLocalConfig();
    const cmd = `APIFY_LOCAL_EMULATION_DIR=./${APIFY_LOCAL_EMULATION_DIR} APIFY_DEFAULT_KEY_VALUE_STORE_ID=${APIFY_DEFAULT_KEY_VALUE_STORE_ID} APIFY_DEFAULT_DATASET_ID=${APIFY_DEFAULT_DATASET_ID} node main.js`;
    await execWithLog(cmd);
};
