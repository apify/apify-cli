const inquirer = require('inquirer');
const path = require('path');
const { ApifyCommand } = require('../lib/apify_command');
const outputs = require('../lib/outputs');
const { setLocalConfig, setLocalEnv, getLocalConfig } = require('../lib/utils');
const { EMPTY_LOCAL_CONFIG, DEFAULT_LOCAL_STORAGE_DIR } = require('../lib/consts');

class InitCommand extends ApifyCommand {
    async run() {
        const { args } = this.parse(InitCommand);
        let { actorName } = args;
        const cwd = process.cwd();

        if (getLocalConfig()) {
            outputs.warning('Skipping creation of apify.json, the file already exists in the current directory.');
        } else {
            if (!actorName) {
                const answer = await inquirer.prompt([{ name: 'actName', message: 'Actor name:', default: path.basename(cwd) }]);
                ({ actName: actorName } = answer);
            }
            await setLocalConfig(Object.assign(EMPTY_LOCAL_CONFIG, { name: actorName }), cwd);
        }
        await setLocalEnv(cwd);
        outputs.success('The Apify actor has been initialized in the current directory.');
    }
}

InitCommand.description = 'Initializes a new actor project in an existing directory.\n'
    + `The command only creates the "apify.json" file and the "${DEFAULT_LOCAL_STORAGE_DIR}" directory in the current directory, `
    + 'but will not touch anything else.\n\n'
    + `WARNING: The directory at "${DEFAULT_LOCAL_STORAGE_DIR}" will be overwritten if it already exists.`;

InitCommand.args = [
    {
        name: 'actorName',
        required: false,
        description: 'Name of the actor. If not provided, you will be prompted for it.',
    },
];

module.exports = InitCommand;
