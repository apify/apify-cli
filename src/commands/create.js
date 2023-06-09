const { flags: flagsHelper } = require('@oclif/command');
const fs = require('fs');
const path = require('path');
const { finished } = require('stream');
const { promisify } = require('util');
const actorTemplates = require('@apify/actor-templates');
const AdmZip = require('adm-zip');
const semver = require('semver');
const { ApifyCommand } = require('../lib/apify_command');
const execWithLog = require('../lib/exec');
const outputs = require('../lib/outputs');
const { updateLocalJson } = require('../lib/files');
const { maybeTrackTelemetry } = require('../lib/telemetry');
const {
    setLocalConfig,
    setLocalEnv,
    getNpmCmd,
    getJsonFileContent,
    detectPythonVersion,
    isPythonVersionSupported,
    getPythonCommand,
    detectNodeVersion,
    isNodeVersionSupported,
    detectNpmVersion,
} = require('../lib/utils');
const { EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH, PYTHON_VENV_PATH, SUPPORTED_NODEJS_VERSION } = require('../lib/consts');
const { httpsGet, ensureValidActorName, getTemplateDefinition } = require('../lib/create-utils');

class CreateCommand extends ApifyCommand {
    async run() {
        const { flags, args } = this.parse(CreateCommand);
        let { actorName } = args;
        const {
            template: templateName,
            skipDependencyInstall,
        } = flags;

        // --template-archive-url is an internal, undocumented flag that's used
        // for testing of templates that are not yet published in the manifest
        let { templateArchiveUrl } = flags;
        let skipOptionalDeps = false;

        // Start fetching manifest immediately to prevent
        // annoying delays that sometimes happen on CLI startup.
        const manifestPromise = templateArchiveUrl
            ? undefined // not fetching manifest when we have direct template URL
            : actorTemplates.fetchManifest().catch((err) => {
                return new Error(`Could not fetch template list from server. Cause: ${err?.message}`);
            });

        actorName = await ensureValidActorName(actorName);
        let messages = null;
        const templateTrackProps = { fromArchiveUrl: !!templateArchiveUrl };
        if (manifestPromise) {
            const templateDefinition = await getTemplateDefinition(templateName, manifestPromise);
            ({ archiveUrl: templateArchiveUrl, skipOptionalDeps, messages } = templateDefinition);
            templateTrackProps.templateId = templateDefinition.id;
            templateTrackProps.templateName = templateDefinition.name;
            templateTrackProps.templateLanguage = templateDefinition.category;
        }

        maybeTrackTelemetry({
            eventName: 'cli_use_template',
            eventData: templateTrackProps,
        });

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

        const zipStream = await httpsGet(templateArchiveUrl);
        const chunks = [];
        zipStream.on('data', (chunk) => chunks.push(chunk));
        await promisify(finished)(zipStream);
        const zip = new AdmZip(Buffer.concat(chunks));
        zip.extractAllTo(actFolderDir, true);

        // There may be .actor/actor.json file in used template - let's try to load it and change the name prop value to actorName
        const localConfig = await getJsonFileContent(path.join(actFolderDir, LOCAL_CONFIG_PATH));
        await setLocalConfig(Object.assign(localConfig || EMPTY_LOCAL_CONFIG, { name: actorName }), actFolderDir);
        await setLocalEnv(actFolderDir);

        const packageJsonPath = path.join(actFolderDir, 'package.json');
        const requirementsTxtPath = path.join(actFolderDir, 'requirements.txt');

        let dependenciesInstalled = false;
        if (!skipDependencyInstall) {
            if (fs.existsSync(packageJsonPath)) {
                const currentNodeVersion = detectNodeVersion();
                const minimumSupportedNodeVersion = semver.minVersion(SUPPORTED_NODEJS_VERSION);
                if (currentNodeVersion) {
                    if (!isNodeVersionSupported(currentNodeVersion)) {
                        outputs.warning(`You are running Node.js version ${currentNodeVersion}, which is no longer supported. `
                            + `Please upgrade to Node.js version ${minimumSupportedNodeVersion} or later.`);
                    }
                    // If the actor is a Node.js actor (has package.json), run `npm install`
                    await updateLocalJson(packageJsonPath, { name: actorName });
                    // Run npm install in actor dir.
                    // For efficiency, don't install Puppeteer for templates that don't use it
                    const cmdArgs = ['install'];
                    if (skipOptionalDeps) {
                        const currentNpmVersion = detectNpmVersion();
                        if (semver.gte(currentNpmVersion, '7.0.0')) {
                            cmdArgs.push('--omit=optional');
                        } else {
                            cmdArgs.push('--no-optional');
                        }
                    }
                    await execWithLog(getNpmCmd(), cmdArgs, { cwd: actFolderDir });
                    dependenciesInstalled = true;
                } else {
                    outputs.error(`No Node.js detected! Please install Node.js ${minimumSupportedNodeVersion} or higher`
                        + ' to be able to run Node.js actors locally.');
                }
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
                        await execWithLog(
                            pythonCommand,
                            ['-m', 'pip', 'install', '--no-cache-dir', '--no-warn-script-location', '--upgrade', 'pip', 'setuptools', 'wheel'],
                            { cwd: actFolderDir },
                        );
                        await execWithLog(
                            pythonCommand,
                            ['-m', 'pip', 'install', '--no-cache-dir', '--no-warn-script-location', '-r', 'requirements.txt'],
                            { cwd: actFolderDir },
                        );
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
            if (messages?.postCreate) {
                outputs.info(messages?.postCreate);
            }
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
    'skip-dependency-install': flagsHelper.boolean({
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
