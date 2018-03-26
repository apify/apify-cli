const { ApifyCommand } = require('../lib/apify_command');
const execWithLog = require('../lib/exec');
const { LOCAL_ENV_VARS } = require('../lib/consts');

class RunCommand extends ApifyCommand {
    async run() {
        await execWithLog('node', ['main.js'], { env: Object.assign(process.env, LOCAL_ENV_VARS) });
    }
}

RunCommand.description = `
Run act on local.
`;

module.exports = RunCommand;
