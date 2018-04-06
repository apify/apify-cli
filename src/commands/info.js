const { ApifyCommand } = require('../lib/apify_command');
const { getLocalUserInfo } = require('../lib/utils');
const chalk = require('chalk');

class InfoCommand extends ApifyCommand {
    static async run() {
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

InfoCommand.description = `
This command displays information about Apify current settings.
`;

module.exports = InfoCommand;
