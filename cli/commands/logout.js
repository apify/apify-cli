const { removeGlobalConfig } = require('../utils/configs');
const { success } = require('../utils/outputs');


module.exports = async () => {
    removeGlobalConfig();
    success(`You are logout from Apify.`);
};

