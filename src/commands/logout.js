const { ApifyCommand } = require('../lib/apify_command');
const { GLOBAL_CONFIGS_FOLDER } = require('../lib/consts');
const { success } = require('../lib/outputs');
const { rimrafPromised } = require('../lib/files');

class LogoutCommand extends ApifyCommand {
    static async run() {
        await rimrafPromised(GLOBAL_CONFIGS_FOLDER);
        success('You are logged out, all settings in the ~/.apify directory were deleted.');
    }
}

LogoutCommand.description = 'Logs out of your Apify account.\nThe command deletes the API token and all other '
    + 'account information stored in the ~/.apify directory. To log in again, call "apify login".';

module.exports = LogoutCommand;
