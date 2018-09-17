const { ApifyCommand } = require('../lib/apify_command');
const { flags: flagsHelper } = require('@oclif/command');
const fs = require('fs');
const path = require('path');
const execWithLog = require('../lib/exec');
const loadJson = require('load-json-file');
const { DEFAULT_LOCAL_STORAGE_DIR } = require('../lib/consts');
const { ENV_VARS } = require('apify-shared/consts');
const {
    getLocalUserInfo, purgeDefaultQueue, purgeDefaultKeyValueStore,
    purgeDefaultDataset, getLocalConfigOrThrow,
} = require('../lib/utils');
const { info } = require('../lib/outputs');

class RunCommand extends ApifyCommand {
    async run() {
        const { flags } = this.parse(RunCommand);
        const { proxy, id: userId, token } = getLocalUserInfo();
        const localConfig = getLocalConfigOrThrow();
        const cwd = process.cwd();

        const packageJsonPath = path.join(cwd, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            throw new Error('The "package.json" file not found in the current directory. Call "npm init" to create it.');
        }
        const serverJsFile = path.join(cwd, 'server.js');
        const packageJson = await loadJson(packageJsonPath);
        if ((!packageJson.scripts || !packageJson.scripts.start) && !fs.existsSync(serverJsFile)) {
            throw new Error('The npm start script not found in package.json. Please set it up for your project. '
                + 'For more information about that call "apify help run".');
        }
        // Purge stores
        if (flags.purge) {
            await Promise.all([purgeDefaultQueue(cwd), purgeDefaultKeyValueStore(cwd), purgeDefaultDataset(cwd)]);
            info('All default local stores were purged.');
        }
        if (flags.purgeQueue) {
            await purgeDefaultQueue(cwd);
            info('Default local request queue was purged.');
        }
        if (flags.purgeDataset) {
            await purgeDefaultDataset(cwd);
            info('Default local dataset was purged.');
        }
        if (flags.purgeKeyValueStore) {
            await purgeDefaultKeyValueStore(cwd);
            info('Default local key-value store was purged.');
        }

        // Attach env vars from local config files
        const localEnvVars = {
            [ENV_VARS.LOCAL_STORAGE_DIR]: DEFAULT_LOCAL_STORAGE_DIR,
        };
        if (proxy && proxy.password) localEnvVars[ENV_VARS.PROXY_PASSWORD] = proxy.password;
        if (userId) localEnvVars[ENV_VARS.USER_ID] = userId;
        if (token) localEnvVars[ENV_VARS.TOKEN] = token;
        if (localConfig.version && localConfig.version.envVars) {
            localConfig.version.envVars.forEach((envVar) => {
                if (envVar.name && envVar.value) localEnvVars[envVar.name] = envVar.value;
            });
        }
        // NOTE: User can overwrite env vars
        const env = Object.assign(localEnvVars, process.env);

        await execWithLog('npm', ['start'], { env });
    }
}

// TODO: we should describe which env vars are set here:

RunCommand.description = 'Runs the actor locally in the current directory by executing "npm start".\n'
    + 'It sets various APIFY_XYZ environment variables '
    + 'in order to provide a working execution environment for the actor. For example, this causes '
    + 'the actor input, as well as all other data in key-value stores, '
    + `datasets or request queues to be stored in the "${DEFAULT_LOCAL_STORAGE_DIR}" directory, `
    + 'rather than on the Apify platform.\n\n'
    + 'NOTE: You can override the default behaviour of command overriding npm start script value in a package.json file. '
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
