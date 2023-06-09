const { flags: flagsHelper } = require('@oclif/command');
const inquirer = require('inquirer');
const { ApifyCommand } = require('../lib/apify_command');
const { success, error } = require('../lib/outputs');
const { getLoggedClient } = require('../lib/utils');
const { getLocalUserInfo } = require('../lib/utils');
const { useApifyIdentity } = require('../lib/telemetry');

class LoginCommand extends ApifyCommand {
    async run() {
        const { flags } = this.parse(LoginCommand);
        let { token } = flags;
        if (!token) {
            console.log('Enter your Apify API token. You can find it at https://console.apify.com/account#/integrations');
            const tokenPrompt = await inquirer.prompt([{ name: 'token', message: 'token:', type: 'password' }]);
            ({ token } = tokenPrompt);
        }
        const isUserLogged = await getLoggedClient(token);
        const userInfo = getLocalUserInfo();
        await useApifyIdentity(userInfo.id);
        return isUserLogged
            ? success(`You are logged in to Apify as ${userInfo.username || userInfo.id}!`)
            : error('Login to Apify failed, the provided API token is not valid.');
    }
}

LoginCommand.description = 'Logs in to your Apify account using a provided API token.\nThe API token and other account '
    + 'information is stored in the ~/.apify directory, from where it is read by all other "apify" commands. '
    + 'To log out, call "apify logout". By using Apify account you agree with [Terms of Service](https://apify.com/terms-of-use).';

LoginCommand.flags = {
    token: flagsHelper.string({
        char: 't',
        description: '[Optional] Apify API token',
        required: false,
    }),
};

module.exports = LoginCommand;
