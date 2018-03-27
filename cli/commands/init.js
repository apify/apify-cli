const { ApifyCommand } = require('../lib/apify_command');
const inquirer = require('inquirer');
const outputs = require('../lib/outputs');
const { setLocalConfig, setLocalEnv } = require('../lib/utils');
const { EMPTY_LOCAL_CONFIG } = require('../lib/consts');

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
        outputs.success(`Initialed act ${actName} in current dir.`);
    }
}

InitCommand.description = `
This asks you for your the act name, writes apify.json and creates apify_local folder structure for local development.
NOTE: This overrides your current apify.json.
`;

InitCommand.args = [
    {
        name: 'actName',
        required: false,
        description: 'Name of initeled act',
    },
];

module.exports = InitCommand;
