const execWithLog = require('../lib/exec');
const { APIFY_LOCAL_EMULATION_DIR, APIFY_DEFAULT_DATASET_ID, APIFY_DEFAULT_KEY_VALUE_STORE_ID } = require('../lib/consts');

module.exports = async () => {
    const env = {
        APIFY_LOCAL_EMULATION_DIR: `./${APIFY_LOCAL_EMULATION_DIR}`,
        APIFY_DEFAULT_KEY_VALUE_STORE_ID: APIFY_DEFAULT_KEY_VALUE_STORE_ID,
        APIFY_DEFAULT_DATASET_ID: APIFY_DEFAULT_DATASET_ID,
    };
    await execWithLog('node', ['main.js'], { env: Object.assign(process.env, env) });
};
