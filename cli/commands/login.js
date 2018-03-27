const { flags } = require('@oclif/command');
const { ApifyCommand } = require('../lib/apify_command');
const inquirer = require('inquirer');
const { success, error } = require('../lib/outputs');
const { getLoggedClient } = require('../lib/utils');

class LoginCommand extends ApifyCommand {
    async run() {
        const { flags } = this.parse(LoginCommand);
        let { token } = flags;
        if (!token) {
            console.log('You can find your API token on https://my.apify.com/account#/integrations.');
            const tokenPrompt = await inquirer.prompt([{ name: 'token', message: 'token:', type: 'password' }]);
            ({ token } = tokenPrompt);
        }
        const isUserLogged = await getLoggedClient(token);
        return (isUserLogged) ?
            success('Logged into Apify!') :
            error('Logging into Apify failed, token is not correct.');
    }
}

LoginCommand.description = `
This is an interactive prompt which authenticates you with Apify.
NOTE: If you set up token options, prompt will skip`;

LoginCommand.flags = {
    'token': flags.string({
        char: 't',
        description: '[Optional] Your API token on Apify',
        required: false,
    }),
};

module.exports = LoginCommand;
