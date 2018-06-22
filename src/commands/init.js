const { ApifyCommand } = require('../lib/apify_command');
const inquirer = require('inquirer');
const outputs = require('../lib/outputs');
const { setLocalConfig, setLocalEnv, getLocalConfig } = require('../lib/utils');
const { EMPTY_LOCAL_CONFIG } = require('../lib/consts');
const path = require('path');

class InitCommand extends ApifyCommand {
    async run() {
        if (getLocalConfig()) {
            throw new Error('File apify.json already exists in current directory.');
        }

        const { args } = this.parse(InitCommand);
        let { actName } = args;
        const cwd = process.cwd();

        if (!actName) {
            const answer = await inquirer.prompt([{ name: 'actName', message: 'Act name:', default: path.basename(cwd) }]);
            ({ actName } = answer);
        }

        await setLocalConfig(Object.assign(EMPTY_LOCAL_CONFIG, { name: actName }), cwd);
        await setLocalEnv(cwd);
        outputs.success(`Initialized act ${actName} in current dir.`);
    }
}

InitCommand.description = 'Initializes an act project in an existing directory.\n' +
    'The command only creates the "apify.json" file and the "apify_local" directory in the current directory, ' +
    'but will not touch anything else.\n\n' +
    'WARNING: If the files already exist, they will be overwritten!';

InitCommand.args = [
    {
        name: 'actName',
        required: false,
        description: 'Name of the act. If not provided, you will be prompted for it.',
    },
];

module.exports = InitCommand;
