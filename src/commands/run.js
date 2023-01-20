const { flags: flagsHelper } = require('@oclif/command');
const fs = require('fs');
const path = require('path');
const loadJson = require('load-json-file');
const { ENV_VARS } = require('@apify/consts');
const semver = require('semver');
const execWithLog = require('../lib/exec');
const { LEGACY_LOCAL_STORAGE_DIR, DEFAULT_LOCAL_STORAGE_DIR, SUPPORTED_NODEJS_VERSION } = require('../lib/consts');
const { ApifyCommand } = require('../lib/apify_command');
const {
    getLocalUserInfo, purgeDefaultQueue, purgeDefaultKeyValueStore,
    purgeDefaultDataset, getLocalConfigOrThrow, getNpmCmd, checkIfStorageIsEmpty,
    detectPythonVersion, isPythonVersionSupported, getPythonCommand,
} = require('../lib/utils');
const { error, info, warning } = require('../lib/outputs');
const { replaceSecretsValue } = require('../lib/secrets');

class RunCommand extends ApifyCommand {
    async run() {
        const { flags } = this.parse(RunCommand);
        const { proxy, id: userId, token } = getLocalUserInfo();
        const localConfig = await getLocalConfigOrThrow();
        const cwd = process.cwd();

        const packageJsonPath = path.join(cwd, 'package.json');
        const mainPyPath = path.join(cwd, 'src/__main__.py');

        const packageJsonExists = fs.existsSync(packageJsonPath);
        const mainPyExists = fs.existsSync(mainPyPath);

        if (!packageJsonExists && !mainPyExists) {
            throw new Error(
                'Actor is of an uknown format.'
                + ` Make sure either the 'package.json' file or 'src/__main__.py' file exists.`,
            );
        }

        if (fs.existsSync(LEGACY_LOCAL_STORAGE_DIR) && !fs.existsSync(DEFAULT_LOCAL_STORAGE_DIR)) {
            fs.renameSync(LEGACY_LOCAL_STORAGE_DIR, DEFAULT_LOCAL_STORAGE_DIR);
            warning("The legacy 'apify_storage' directory was renamed to 'storage' to align it with Apify SDK v3."
                + ' Contents were left intact.');
        }

        // Purge stores
        if (flags.purge) {
            await Promise.all([purgeDefaultQueue(), purgeDefaultKeyValueStore(), purgeDefaultDataset()]);
            info('All default local stores were purged.');
        }
        if (flags.purgeQueue) {
            await purgeDefaultQueue();
            info('Default local request queue was purged.');
        }
        if (flags.purgeDataset) {
            await purgeDefaultDataset();
            info('Default local dataset was purged.');
        }
        if (flags.purgeKeyValueStore) {
            await purgeDefaultKeyValueStore();
            info('Default local key-value store was purged.');
        }

        if (!flags.purge) {
            const isStorageEmpty = await checkIfStorageIsEmpty();
            if (!isStorageEmpty) {
                warning('The storage directory contains a previous state, the actor will continue where it left off. '
                    + 'To start from the initial state, use --purge parameter to clean the storage directory.');
            }
        }

        // Attach env vars from local config files
        const localEnvVars = {
            [ENV_VARS.LOCAL_STORAGE_DIR]: DEFAULT_LOCAL_STORAGE_DIR,
        };
        if (proxy && proxy.password) localEnvVars[ENV_VARS.PROXY_PASSWORD] = proxy.password;
        if (userId) localEnvVars[ENV_VARS.USER_ID] = userId;
        if (token) localEnvVars[ENV_VARS.TOKEN] = token;
        if (localConfig.environmentVariables) {
            const updatedEnv = replaceSecretsValue(localConfig.environmentVariables);
            Object.assign(localEnvVars, updatedEnv);
        }
        // NOTE: User can overwrite env vars
        const env = Object.assign(localEnvVars, process.env);

        if (!userId) {
            warning('You are not logged in with your Apify Account. Some features like Apify Proxy will not work. Call "apify login" to fix that.');
        }

        if (packageJsonExists) { // Actor is written in Node.js
            const serverJsFile = path.join(cwd, 'server.js');
            const packageJson = await loadJson(packageJsonPath);
            if ((!packageJson.scripts || !packageJson.scripts.start) && !fs.existsSync(serverJsFile)) {
                throw new Error('The "npm start" script was not found in package.json. Please set it up for your project. '
                    + 'For more information about that call "apify help run".');
            }

            // --max-http-header-size=80000
            // Increases default size of headers. The original limit was 80kb, but from node 10+ they decided to lower it to 8kb.
            // However they did not think about all the sites there with large headers,
            // so we put back the old limit of 80kb, which seems to work just fine.
            const currentNodeVersion = process.versions.node;
            const lastSupportedVersion = semver.minVersion(SUPPORTED_NODEJS_VERSION);
            if (semver.gte(currentNodeVersion, lastSupportedVersion)) {
                env.NODE_OPTIONS = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} --max-http-header-size=80000` : '--max-http-header-size=80000';
            } else {
                warning(`You are running Node.js version ${currentNodeVersion}, which is no longer supported. `
                    + `Please upgrade to Node.js version ${lastSupportedVersion} or later.`);
            }
            await execWithLog(getNpmCmd(), ['start'], { env });
        } else if (mainPyExists) {
            const pythonVersion = detectPythonVersion(cwd);
            if (pythonVersion) {
                if (isPythonVersionSupported(pythonVersion)) {
                    const pythonCommand = getPythonCommand(cwd);
                    await execWithLog(pythonCommand, ['-m', 'src'], { env });
                } else {
                    error(`Python actors require Python 3.8 or higher, but you have Python ${pythonVersion}!`);
                    error('Please install Python 3.8 or higher to be able to run Python actors locally.');
                }
            } else {
                error('No Python detected! Please install Python 3.8 or higher to be able to run Python actors locally.');
            }
        }
    }
}

// TODO: we should describe which env vars are set here:

RunCommand.description = 'Runs the actor locally in the current directory by executing "npm start".\n'
    + 'It sets various APIFY_XYZ environment variables '
    + 'in order to provide a working execution environment for the actor. For example, this causes '
    + 'the actor input, as well as all other data in key-value stores, '
    + `datasets or request queues to be stored in the "${DEFAULT_LOCAL_STORAGE_DIR}" directory, `
    + 'rather than on the Apify platform.\n\n'
    + 'NOTE: You can override the command\'s default behavior by overriding the npm start script value in a package.json file. '
    + 'You can set up your own main file or environment variables by changing it.';

RunCommand.flags = {
    purge: flagsHelper.boolean({
        char: 'p',
        description: 'Shortcut that combines the --purge-queue, --purge-dataset and --purge-key-value-store options.',
        required: false,
    }),
    'purge-queue': flagsHelper.boolean({
        description: 'Deletes the local directory containing the default request queue before the run starts.',
        required: false,
    }),
    'purge-dataset': flagsHelper.boolean({
        description: 'Deletes the local directory containing the default dataset before the run starts.',
        required: false,
    }),
    'purge-key-value-store': flagsHelper.boolean({
        description: 'Deletes all records from the default key-value store in the local directory before the run starts, except for the "INPUT" key.',
        required: false,
    }),
};

module.exports = RunCommand;
