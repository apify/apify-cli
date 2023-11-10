const chalk = require('chalk');

const { ApifyCommand } = require('../lib/apify_command');
const { getLoggedClientOrThrow, getLocalUserInfo } = require('../lib/utils');

class InfoCommand extends ApifyCommand {
    async run() {
        await getLoggedClientOrThrow();
        const info = await getLocalUserInfo();

        if (info) {
            const niceInfo = {
                username: info.username,
                userId: info.id,
            };
            Object.keys(niceInfo).forEach((key) => console.log(`${chalk.gray(key)}: ${chalk.bold(niceInfo[key])}`));
        }
    }
}

InfoCommand.description = 'Displays information about the currently active Apify account.\n'
    + 'The information is printed to the console.';

module.exports = InfoCommand;
