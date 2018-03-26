const { flags } = require('@oclif/command');
const { ApifyCommand } = require('../lib/apify_command');
const inquirer = require('inquirer');
const fs = require('fs');
const { success, error } = require('../lib/outputs');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH } = require('../lib/consts');
const utils = require('../lib/utils');

class LoginCommand extends ApifyCommand {
    async run() {
        const { flags } = this.parse(LoginCommand);
        let { token } = flags;
        if (!token) {
            console.log('You can find your API token on https://my.apify.com/account#/integrations.');
            const tokenPrompt = await inquirer.prompt([{ name: 'token', message: 'token:', type: 'password' }]);
            ({ token } = tokenPrompt);
        }
        if (!fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            fs.mkdirSync(GLOBAL_CONFIGS_FOLDER);
        }
        const isUserLogged = await utils.getLoggedClient(token);
        if (isUserLogged) {
            success('Logged into Apify!');
        } else {
            error('Logging into Apify failed, token is not correct.');
        }
    }
}

LoginCommand.description = `
Use for authenticate your local machine with Apify.
Command proms your credentials from console or you can pass them using parameters.`;

LoginCommand.flags = {
    'token': flags.string({
        char: 't',
        description: '[Optional] Your API token on Apify',
        required: false,
    }),
};

module.exports = LoginCommand;
