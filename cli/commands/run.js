const { ApifyCommand } = require('../lib/apify_command');
const execWithLog = require('../lib/exec');
const { LOCAL_ENV_VARS } = require('../lib/consts');

class RunCommand extends ApifyCommand {
    static async run() {
        await execWithLog('node', ['main.js'], { env: Object.assign(process.env, LOCAL_ENV_VARS) });
    }
}

RunCommand.description = `
This runs act from current directory. It uses apify_local for getting input and setting output and storing data.
`;

module.exports = RunCommand;
