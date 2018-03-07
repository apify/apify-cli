const inquirer = require('inquirer');
const { setLocalCredentials } = require('../lib/configs');
const { success, error } = require('../lib/outputs');


module.exports = async () => {
    // TODO: If we have API for user securities use it
    // and prompt only token
    console.log('You can find your userId and token on https://my.apify.com/account#/integrations.');
    const credentials = await inquirer.prompt([{ name: 'userId', message: 'userId:' }, { name: 'token', message: 'token:', type: 'password' }]);
    try {
        await setLocalCredentials(credentials.token, credentials.userId);
    } catch (e) {
        error('Can not login to Apify with this credentials.');
        return;
    }
    success('Logged into Apify!');
};
