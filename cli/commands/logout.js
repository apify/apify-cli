const { GLOBAL_CONFIGS_FOLDER } = require('../lib/consts');
const { success } = require('../lib/outputs');
const { rimrafPromised } = require('../lib/files');


module.exports = async () => {
    await rimrafPromised(GLOBAL_CONFIGS_FOLDER);
    success('You are logout from Apify.');
};

