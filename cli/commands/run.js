const { ApifyCommand } = require('../lib/apify_command');
const execWithLog = require('../lib/exec');
const { LOCAL_ENV_VARS, PROXY_PASSWORD_ENV_VAR } = require('../lib/consts');
const { getLocalUserInfo } = require('../lib/utils');

class RunCommand extends ApifyCommand {
    static async run() {
        const { proxy } = getLocalUserInfo();
        const env = Object.assign(process.env, LOCAL_ENV_VARS);
        if (proxy && proxy.password) {
            env[PROXY_PASSWORD_ENV_VAR] = proxy.password;
        }

        await execWithLog('node', ['main.js'], { env });
    }
}

RunCommand.description = `
This runs act locally from current directory. It uses apify_local for getting input and setting output and storing data.
`;

module.exports = RunCommand;
