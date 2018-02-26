const { removeGlobalConfig } = require('../lib/configs');


module.exports = async () => {
    removeGlobalConfig();
    console.log(`You are logout from Apify.`)
};

