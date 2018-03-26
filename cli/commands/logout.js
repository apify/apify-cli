const { ApifyCommand } = require('../lib/apify_command');
const { GLOBAL_CONFIGS_FOLDER } = require('../lib/consts');
const { success } = require('../lib/outputs');
const { rimrafPromised } = require('../lib/files');


class LogoutCommand extends ApifyCommand {
    async run() {
        await rimrafPromised(GLOBAL_CONFIGS_FOLDER);
        success('You are logout from Apify.');
    }
}

LogoutCommand.description = `
Use for logout local machine from Apify.
`;

module.exports = LogoutCommand;
