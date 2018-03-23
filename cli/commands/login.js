const inquirer = require('inquirer');
const writeJSON = require('write-json-file');
const fs = require('fs');
const { success, error } = require('../lib/outputs');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH } = require('../lib/consts');
const utils = require('../lib/utils');

const {Command, flags} = require('@oclif/command');

class LoginCommand extends Command {
    async run() {
        const { flags, args } = this.parse(LoginCommand);
        let { userId, token } = args;
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
Describe the command here
...
Extra documentation goes here
`;

LoginCommand.flags = {
    userId: flags.string({ description: 'User ID'}),
    token: flags.string({ description: 'Token'}),
};

module.exports = LoginCommand;
