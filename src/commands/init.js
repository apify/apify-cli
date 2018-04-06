const { ApifyCommand } = require('../lib/apify_command');
const inquirer = require('inquirer');
const outputs = require('../lib/outputs');
const { setLocalConfig, setLocalEnv } = require('../lib/utils');
const { EMPTY_LOCAL_CONFIG } = require('../lib/consts');

// TODO: BUG - if prompted act name is empty, the command prefills some weird directory
// jan:myact1$ apify init
//    ? Act name: /Users/jan/Projects/apify-cli/cli/commands
// Success: Initialized act /Users/jan/Projects/apify-cli/cli/commands in current dir.

// TODO: If apify.json already exists locally, you should return an error!

class InitCommand extends ApifyCommand {
    async run() {
        const { args } = this.parse(InitCommand);
        let { actName } = args;
        if (!actName) {
            const answer = await inquirer.prompt([{ name: 'actName', message: 'Act name:', default: __dirname }]);
            ({ actName } = answer);
        }
        const cwd = process.cwd();
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
