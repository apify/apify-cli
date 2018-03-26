const { ApifyCommand } = require('../lib/apify_command');
const { flags } = require('@oclif/command');
const fs = require('fs');
const path = require('path');
const copy = require('recursive-copy');
const inquirer = require('inquirer');
const execWithLog = require('../lib/exec');
const outputs = require('../lib/outputs');
const { updateLocalJSON } = require('../lib/files');
const { setLocalConfig, setLocalEnv } = require('../lib/utils');
const { ACTS_TEMPLATES, DEFAULT_ACT_TEMPLATE, EMPTY_LOCAL_CONFIG, ACTS_TEMPLATE_LIST } = require('../lib/consts');

class CreateCommand extends ApifyCommand {
    async run() {
        const { flags, args } = this.parse(CreateCommand);
        let { actName } = args;
        let { template } = flags;
        if (!template) {
            const choices = Object.values(ACTS_TEMPLATES);
            const answer = await inquirer.prompt([{
                type: 'list',
                name: 'template',
                message: 'Which act do you want to create?',
                default: DEFAULT_ACT_TEMPLATE,
                choices,
            }]);
            ({ template } = answer);
        }
        const cwd = process.cwd();
        const actFolderDir = path.join(cwd, actName);

        // Create act structure
        fs.mkdirSync(actFolderDir);
        await copy(ACTS_TEMPLATES[template].dir, actFolderDir, { dot: true });
        await setLocalConfig(Object.assign(EMPTY_LOCAL_CONFIG, { name: actName }), actFolderDir);
        await setLocalEnv(actFolderDir);
        await updateLocalJSON(path.join(actFolderDir, 'package.json'), { name: actName });

        // Run npm install in act dir
        const cmd = 'npm';
        const cmdArgs = ['install'];
        if (template === ACTS_TEMPLATES.basic.value) cmdArgs.push('--no-optional');
        await execWithLog(cmd, cmdArgs, { cwd: actFolderDir });

        outputs.success(`Act ${actName} was created. Run it with "apify run".`);
    }
}

CreateCommand.description = `
Create directory for act local development.
You can specified template for act.
`;

CreateCommand.flags = {
    template: flags.string({
        char: 't',
        description: `Act template, if not pass it'll promt from console.`,
        required: false,
        options: ACTS_TEMPLATE_LIST,
    })
};

CreateCommand.args = [
    {
        name: 'actName',
        required: true,
        description: 'Name of created act',
    }
]

module.exports = CreateCommand;
