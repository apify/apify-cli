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
const {
    setLocalConfig,
    setLocalEnv,
    getNpmCmd,
    validateActorName,
    getJsonFileContent,
    detectPythonVersion,
    isPythonVersionSupported,
    getPythonCommand,
} = require('../lib/utils');
const { EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH, PYTHON_VENV_PATH } = require('../lib/consts');

class CreateCommand extends ApifyCommand {
    async run() {
        const { flags, args } = this.parse(CreateCommand);
        let { actorName } = args;
        let { templateArchiveUrl, template: templateName } = flags;
        const { dontInstallDependencies } = flags;
        let skipOptionalDeps = false;

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

        if (!templateArchiveUrl) {
            const manifest = await actorTemplates.fetchManifest();
            if (!templateName) {
                const choices = manifest.templates.map((t) => ({
                    value: t.name,
                    name: t.description,
                }));

                const answer = await inquirer.prompt([{
                    type: 'list',
                    name: 'template',
                    message: 'Please select the template for your new actor',
                    default: choices[0],
                    choices,
                    loop: false,
                    pageSize: 8, // Due to the answers wrapping, the prompt looks best if the `pageSize` is a multiple of 2
                }]);
                templateName = answer.template;
            }

            const templateObj = manifest.templates.find((t) => t.name === templateName);
            ({ archiveUrl: templateArchiveUrl, skipOptionalDeps } = templateObj);
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

        const zipStream = await gotScraping({
            url: templateArchiveUrl,
            isStream: true,
        });
        const unzip = unzipper.Extract({ path: actFolderDir });
        await zipStream.pipe(unzip).promise();

        // There may be .actor/actor.json file in used template - let's try to load it and change the name prop value to actorName
        const localConfig = await getJsonFileContent(path.join(actFolderDir, LOCAL_CONFIG_PATH));
        await setLocalConfig(Object.assign(localConfig || EMPTY_LOCAL_CONFIG, { name: actorName }), actFolderDir);
        await setLocalEnv(actFolderDir);

        const packageJsonPath = path.join(actFolderDir, 'package.json');
        const requirementsTxtPath = path.join(actFolderDir, 'requirements.txt');

        let dependenciesInstalled = false;
        if (!dontInstallDependencies) {
            if (fs.existsSync(packageJsonPath)) {
                // If the actor is a Node.js actor (has package.json), run `npm install`
                await updateLocalJson(packageJsonPath, { name: actorName });
                // Run npm install in actor dir.
                // For efficiency, don't install Puppeteer for templates that don't use it
                const cmdArgs = ['install'];
                if (skipOptionalDeps) cmdArgs.push('--no-optional');
                await execWithLog(getNpmCmd(), cmdArgs, { cwd: actFolderDir });
                dependenciesInstalled = true;
            } else if (fs.existsSync(requirementsTxtPath)) {
                const pythonVersion = detectPythonVersion(actFolderDir);
                if (pythonVersion) {
                    if (isPythonVersionSupported(pythonVersion)) {
                        const venvPath = path.join(actFolderDir, '.venv');
                        outputs.info(`Python version ${pythonVersion} detected.`);
                        outputs.info(`Creating a virtual environment in "${venvPath}" and installing dependencies from "requirements.txt"...`);
                        let pythonCommand = getPythonCommand(actFolderDir);
                        if (!process.env.VIRTUAL_ENV) {
                            // If Python is not running in a virtual environment, create a new one
                            await execWithLog(pythonCommand, ['-m', 'venv', '--prompt', '.', PYTHON_VENV_PATH], { cwd: actFolderDir });
                            // regenerate the `pythonCommand` after we create the virtual environment
                            pythonCommand = getPythonCommand(actFolderDir);
                        }
                        await execWithLog(pythonCommand, ['-m', 'pip', 'install', '--upgrade', 'pip'], { cwd: actFolderDir });
                        await execWithLog(pythonCommand, ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: actFolderDir });
                        dependenciesInstalled = true;
                    } else {
                        outputs.warning(`Python actors require Python 3.8 or higher, but you have Python ${pythonVersion}!`);
                        outputs.warning('Please install Python 3.8 or higher to be able to run Python actors locally.');
                    }
                } else {
                    outputs.warning('No Python detected! Please install Python 3.8 or higher to be able to run Python actors locally.');
                }
            }
        }

        if (dependenciesInstalled) {
            outputs.success(`Actor '${actorName}' was created. To run it, run "cd ${actorName}" and "apify run".`);
        } else {
            outputs.success(`Actor '${actorName}' was created. Please install its dependencies to be able to run it using "apify run".`);
        }
    }
}

CreateCommand.description = 'Creates a new actor project directory from a selected boilerplate template.';

CreateCommand.flags = {
    template: flagsHelper.string({
        char: 't',
        description: 'Template for the actor. If not provided, the command will prompt for it.\n'
            + `Visit ${actorTemplates.manifestUrl} to find available template names.`,
        required: false,
    }),
    'dont-install-dependencies': flagsHelper.boolean({
        description: 'Skip installing actor dependencies.',
        required: false,
    }),
    'template-archive-url': flagsHelper.string({
        description: 'Actor template archive url. Useful for developing new templates.',
        required: false,
        hidden: true,
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
