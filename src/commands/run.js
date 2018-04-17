const { ApifyCommand } = require('../lib/apify_command');
const execWithLog = require('../lib/exec');
const { LOCAL_ENV_VARS } = require('../lib/consts');
const { ENV_VARS } = require('apify-shared/consts');
const { getLocalUserInfo } = require('../lib/utils');

// TODO: Shall we also pass APIFY_TOKEN ?

class RunCommand extends ApifyCommand {
    static async run() {
        const { proxy, id: userId, token } = getLocalUserInfo();

        // NOTE: User can overwrite env vars
        const env = Object.assign(LOCAL_ENV_VARS, process.env);

        if (proxy && proxy.password) env[ENV_VARS.PROXY_PASSWORD] = proxy.password;
        if (userId) env[ENV_VARS.USER_ID] = userId;
        if (token) env[ENV_VARS.TOKEN] = token;

        await execWithLog('node', ['main.js'], { env });
    }
}

// TODO: we should describe which env vars are set here:

RunCommand.description = 'Runs the act locally in the current directory.\n' +
    'The command runs a Node.js process with the act in the current directory. It sets various APIFY_XYZ environment variables ' +
    'in order to provide a working execution environment for the act. For example, this causes ' +
    'the act input, as well as all other data in key-value stores, datasets or request queues to be stored in the "apify_local" directory, ' +
    'rather than on the Apify platform.';

module.exports = RunCommand;
