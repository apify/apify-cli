const { flags: flagsHelper } = require('@oclif/command');
const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const { gotScraping } = require('got-scraping');
const actorTemplates = require('@apify/actor-templates');
const unzipper = require('unzipper');
const { ApifyCommand } = require('../lib/apify_command');
const execWithLog = require('../lib/exec');
const outputs = require('../lib/outputs');
const { updateLocalJson } = require('../lib/files');
const { setLocalConfig, setLocalEnv, getNpmCmd, validateActorName, getJsonFileContent } = require('../lib/utils');
const { EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH } = require('../lib/consts');

class CreateCommand extends ApifyCommand {
    async run() {
        const { flags, args } = this.parse(CreateCommand);
        let { actorName } = args;
        let templateName = flags.template;

        // Check proper format of actorName
        if (!actorName) {
            const actorNamePrompt = await inquirer.prompt([{
                name: 'actorName',
                message: 'Name of the new actor:',
                type: 'input',
                validate: (promptText) => {
                    try {
                        validateActorName(promptText);
                    } catch (err) {
                        return err.message;
                    }
                    return true;
                },
            }]);
            ({ actorName } = actorNamePrompt);
        } else {
            validateActorName(actorName);
        }

        const manifest = await actorTemplates.fetchManifest();
        const choices = manifest.templates.map((t) => ({
            value: t.name,
            name: t.description,
        }));

        if (!templateName) {
            const answer = await inquirer.prompt([{
                type: 'list',
                name: 'template',
                message: 'Please select the template for your new actor',
                default: choices[0],
                choices,
            }]);
            templateName = answer.template;
        }
        const cwd = process.cwd();
        const actFolderDir = path.join(cwd, actorName);

        // Create actor directory structure
        try {
            fs.mkdirSync(actFolderDir);
        } catch (err) {
            if (err.code && err.code === 'EEXIST') {
                outputs.error(`Cannot create new actor, directory '${actorName}' already exists. `
                    + 'You can use "apify init" to create a local actor environment inside an existing directory.');
                return;
            }
            throw err;
        }
        const templateObj = manifest.templates.find((t) => t.name === templateName);
        const { archiveUrl } = templateObj;

        const zipStream = await gotScraping({
            url: archiveUrl,
            isStream: true,
        });
        const unzip = unzipper.Extract({ path: actFolderDir });
        await zipStream.pipe(unzip).promise();

        // There may be .actor/actor.json file in used template - let's try to load it and change the name prop value to actorName
        const localConfig = await getJsonFileContent(path.join(actFolderDir, LOCAL_CONFIG_PATH));
        await setLocalConfig(Object.assign(localConfig || EMPTY_LOCAL_CONFIG, { name: actorName }), actFolderDir);
        await updateLocalJson(path.join(actFolderDir, 'package.json'), { name: actorName });

        // Run npm install in actor dir.
        // For efficiency, don't install Puppeteer for templates that don't use it
        const cmdArgs = ['install'];
        if (templateObj.skipOptionalDeps) cmdArgs.push('--no-optional');
        await execWithLog(getNpmCmd(), cmdArgs, { cwd: actFolderDir });

        outputs.success(`Actor '${actorName}' was created. To run it, run "cd ${actorName}" and "apify run".`);
    }
}

CreateCommand.description = 'Creates a new actor project directory from a selected boilerplate template.';

CreateCommand.flags = {
    template: flagsHelper.string({
        char: 't',
        description: 'Template for the actor. If not provided, the command will prompt for it.'
            + `Visit ${actorTemplates.manifestUrl} to find available template names.`,
        required: false,
    }),
};

CreateCommand.args = [
    {
        name: 'actorName',
        required: false,
        description: 'Name of the actor and its directory',
    },
];

module.exports = CreateCommand;
