const { flags } = require('@oclif/command');
const { ApifyCommand } = require('../lib/apify_command');
const inquirer = require('inquirer');
const writeJSON = require('write-json-file');
const fs = require('fs');
const { success, error } = require('../lib/outputs');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH } = require('../lib/consts');
const utils = require('../lib/utils');

class LoginCommand extends ApifyCommand {
    async run() {
        const { flags, args } = this.parse(LoginCommand);
        let { userId, token } = flags;
        // TODO: If we have API for user securities use it
        // and prompts only token
        if (!userId && !token) {
            console.log('You can find your userId and token on https://my.apify.com/account#/integrations.');
            const credentials = await inquirer.prompt([{ name: 'userId', message: 'userId:' }, { name: 'token', message: 'token:', type: 'password' }]);
            ({ userId, token } = credentials);
        }
        if (!fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            fs.mkdirSync(GLOBAL_CONFIGS_FOLDER);
        }
        const auth = {
            token,
            userId,
        };
        const isUserLogged = await utils.getLoggedClient(auth);
        if (isUserLogged) {
            writeJSON.sync(AUTH_FILE_PATH, auth);
            success('Logged into Apify!');
        } else {
            error('Logging into Apify failed, token or userId is not correct.');
        }
    }
}

LoginCommand.description = `
Use for authenticate your local machine with Apify.
Command proms your credentials from console or you can pass them using parameters.`;

LoginCommand.flags = {
    'user-id': flags.string({
        char: 'u',
        description: '[Optional] Your user ID on Apify',
        required: false,
    }),
    'token': flags.string({
        char: 't',
        description: '[Optional] Your API token on Apify',
        required: false,
    }),
};

module.exports = LoginCommand;
