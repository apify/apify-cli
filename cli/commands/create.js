const { ApifyCommand } = require('../lib/apify_command');
const { flags: flagsHelper } = require('@oclif/command');
const fs = require('fs');
const path = require('path');
const copy = require('recursive-copy');
const inquirer = require('inquirer');
const execWithLog = require('../lib/exec');
const outputs = require('../lib/outputs');
const { updateLocalJson } = require('../lib/files');
const { setLocalConfig, setLocalEnv } = require('../lib/utils');
const { ACTS_TEMPLATES, DEFAULT_ACT_TEMPLATE, EMPTY_LOCAL_CONFIG, ACTS_TEMPLATE_LIST } = require('../lib/consts');

class CreateCommand extends ApifyCommand {
    async run() {
        const { flags, args } = this.parse(CreateCommand);
        const { actName } = args;
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

        // Create act folder structure
        try {
            fs.mkdirSync(actFolderDir);
        } catch (err) {
            if (err.code && err.code === 'EEXIST') {
                outputs.error(`Folder with name ${actName} already exists. ` +
                    'You can call "apify init" to create local environment for act inside folder.');
                return;
            }
            throw err;
        }
        await copy(ACTS_TEMPLATES[template].dir, actFolderDir, { dot: true });
        await setLocalConfig(Object.assign(EMPTY_LOCAL_CONFIG, { name: actName }), actFolderDir);
        await setLocalEnv(actFolderDir);
        await updateLocalJson(path.join(actFolderDir, 'package.json'), { name: actName });

        // Run npm install in act dir
        const cmd = 'npm';
        const cmdArgs = ['install'];
        if (template === ACTS_TEMPLATES.basic.value) cmdArgs.push('--no-optional');
        await execWithLog(cmd, cmdArgs, { cwd: actFolderDir });

        outputs.success(`Act ${actName} was created. Run it with "apify run".`);
    }
}

CreateCommand.description = `
This creates directory with proper structure for local development.
NOTE: You can specified act template, which can help you in specific use cases like crawling urls list or crawling with queue.
`;

CreateCommand.flags = {
    template: flagsHelper.string({
        char: 't',
        description: 'Act template, if not pass it\'ll prompt from the console.',
        required: false,
        options: ACTS_TEMPLATE_LIST,
    }),
};

CreateCommand.args = [
    {
        name: 'actName',
        required: true,
        description: 'Name of creating act',
    },
];

module.exports = CreateCommand;
