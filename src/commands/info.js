const { ApifyCommand } = require('../lib/apify_command');
const { getLoggedClientOrThrow, getLocalUserInfo } = require('../lib/utils');
const chalk = require('chalk');

class InfoCommand extends ApifyCommand {
    static async run() {
        await getLoggedClientOrThrow();
        const info = await getLocalUserInfo();

        if (info) {
            const niceInfo = {
                username: info.username,
                userId: info.id,
                token: info.token,
                proxyPassword: info.proxy.password,
            };
            Object.keys(niceInfo).forEach(key => console.log(`${chalk.gray(key)}: ${chalk.bold(niceInfo[key])}`));
        }
    }
}

InfoCommand.description = 'Displays information about Apify current settings.\n' +
    'This command prints information about Apify to console.';

module.exports = InfoCommand;
