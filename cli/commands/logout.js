const { GLOBAL_CONFIGS_FOLDER } = require('../lib/consts');
const { success } = require('../lib/outputs');
const { promisify } = require('util');
const rimraf = require('rimraf');


module.exports = async () => {
    await promisify(rimraf)(GLOBAL_CONFIGS_FOLDER);
    success(`You are logout from Apify.`);
};

