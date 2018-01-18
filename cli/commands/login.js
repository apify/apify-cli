const inquirer = require('inquirer');
const { setConfig } = require('../lib/configs');


module.exports = async () => {
    console.log('You can find your userId and token on https://my.apify.com/account#/integrations.');
    const credentials = await inquirer.prompt([{ name: 'userId', message: 'userId:' }, { name: 'token', message: 'token:', type: 'password' }]);
    await setConfig(credentials);
};