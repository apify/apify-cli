const { ApifyCommand } = require('../lib/apify_command');
const { AUTH_FILE_PATH } = require('../lib/consts');
const { success } = require('../lib/outputs');
const { rimrafPromised } = require('../lib/files');
const { regenerateLocalDistinctId } = require('../lib/telemetry');

class LogoutCommand extends ApifyCommand {
    static async run() {
        await rimrafPromised(AUTH_FILE_PATH);
        regenerateLocalDistinctId();
        success('You are logged out, all settings in the ~/.apify directory were deleted.');
    }
}

LogoutCommand.description = 'Logs out of your Apify account.\nThe command deletes the API token and all other '
    + 'account information stored in the ~/.apify directory. To log in again, call "apify login".';

module.exports = LogoutCommand;
