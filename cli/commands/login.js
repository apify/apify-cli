const inquirer = require('inquirer');
const { setLocalAuth } = require('../lib/configs');


module.exports = async () => {
    // TODO: If we have API for user securities use it
    // and prompt only token
    console.log('You can find your userId and token on https://my.apify.com/account#/integrations.');
    const credentials = await inquirer.prompt([{ name: 'userId', message: 'userId:' }, { name: 'token', message: 'token:', type: 'password' }]);
    try {
        await setLocalAuth(credentials.token, credentials.userId);
    } catch (e) {
        console.log('Can not login to Apify with this credentials.');
        return;
    }
    console.log('Logged into Apify!');
};
