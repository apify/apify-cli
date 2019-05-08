const { ApifyCommand } = require('../lib/apify_command');
const { flags: flagsHelper } = require('@oclif/command');
const { DNS_SAFE_NAME_REGEX } = require('apify-shared/regexs');
const fs = require('fs');
const path = require('path');
const copy = require('recursive-copy');
const inquirer = require('inquirer');
const execWithLog = require('../lib/exec');
const outputs = require('../lib/outputs');
const { updateLocalJson } = require('../lib/files');
const { setLocalConfig, setLocalEnv, getNpmCmd } = require('../lib/utils');
const { ACTS_TEMPLATES, DEFAULT_ACT_TEMPLATE, EMPTY_LOCAL_CONFIG, ACTS_TEMPLATE_LIST } = require('../lib/consts');

class CreateCommand extends ApifyCommand {
    async run() {
        const { flags, args } = this.parse(CreateCommand);
        const { actorName } = args;
        let { template } = flags;

        // Check proper format of actorName
        if (!DNS_SAFE_NAME_REGEX.test(actorName)) {
            throw new Error('Name of your actor, ' +
                'must be a DNS hostname-friendly string(e.g. my-newest-actor).');
        }

        if (!template) {
            const choices = Object.values(ACTS_TEMPLATES);
            const answer = await inquirer.prompt([{
                type: 'list',
                name: 'template',
                message: 'Please select the template for your new actor',
                default: DEFAULT_ACT_TEMPLATE,
                choices,
            }]);
            ({ template } = answer);
        }
        const cwd = process.cwd();
        const actFolderDir = path.join(cwd, actorName);

        // Create actor directory structure
        try {
            fs.mkdirSync(actFolderDir);
        } catch (err) {
            if (err.code && err.code === 'EEXIST') {
                outputs.error(`Cannot create new actor, directory '${actorName}' already exists. ` +
                    'You can use "apify init" to create a local actor environment inside an existing directory.');
                return;
            }
            throw err;
        }
        await copy(ACTS_TEMPLATES[template].dir, actFolderDir, { dot: true });
        await setLocalConfig(Object.assign(EMPTY_LOCAL_CONFIG, { name: actorName, template }), actFolderDir);
        await setLocalEnv(actFolderDir);
        await updateLocalJson(path.join(actFolderDir, 'package.json'), { name: actorName });

        // Run npm install in actor dir
        const cmdArgs = ['install'];
        if (template === ACTS_TEMPLATES.basic.value) cmdArgs.push('--no-optional');
        await execWithLog(getNpmCmd(), cmdArgs, { cwd: actFolderDir });

        outputs.success(`Actor '${actorName}' was created. To run it, run "cd ${actorName}" and "apify run".`);
    }
}

CreateCommand.description = 'Creates a new actor project directory from a selected boilerplate template.';

CreateCommand.flags = {
    template: flagsHelper.string({
        char: 't',
        description: 'Boilerplate template for the actor. If not provided, the command will prompt for it.',
        required: false,
        options: ACTS_TEMPLATE_LIST,
    }),
};

CreateCommand.args = [
    {
        name: 'actorName',
        required: true,
        description: 'Name of the actor and its directory',
    },
];

module.exports = CreateCommand;
