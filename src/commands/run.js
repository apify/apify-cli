const { ApifyCommand } = require('../lib/apify_command');
const execWithLog = require('../lib/exec');
const { LOCAL_ENV_VARS } = require('../lib/consts');
const { ENV_VARS } = require('apify-shared/consts');
const { getLocalUserInfo } = require('../lib/utils');

class RunCommand extends ApifyCommand {
    static async run() {
        const { proxy, id: userId, token } = getLocalUserInfo();
        const apifyLocalEnvVars = LOCAL_ENV_VARS;

        if (proxy && proxy.password) apifyLocalEnvVars[ENV_VARS.PROXY_PASSWORD] = proxy.password;
        if (userId) apifyLocalEnvVars[ENV_VARS.USER_ID] = userId;
        if (token) apifyLocalEnvVars[ENV_VARS.TOKEN] = token;

        // NOTE: User can overwrite env vars
        const env = Object.assign(apifyLocalEnvVars, process.env);

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
