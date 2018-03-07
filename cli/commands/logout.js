const { removeGlobalConfig } = require('../lib/configs');
const { success } = require('../lib/outputs');


module.exports = async () => {
    removeGlobalConfig();
    success(`You are logout from Apify.`);
};

