const { ApifyCommand } = require('../lib/apify_command');
const { flags: flagsHelper } = require('@oclif/command');
const fs = require('fs');
const path = require('path');
const execWithLog = require('../lib/exec');
const { MAIN_FILE, DEFAULT_LOCAL_STORAGE_DIR } = require('../lib/consts');
const { ENV_VARS } = require('apify-shared/consts');
const {
    getLocalUserInfo, purgeDefaultQueue, purgeDefaultKeyValueStore, purgeDefaultDataset, getLocalConfigOrThrow,
} = require('../lib/utils');
const { info } = require('../lib/outputs');

class RunCommand extends ApifyCommand {
    async run() {
        const { flags } = this.parse(RunCommand);
        const { proxy, id: userId, token } = getLocalUserInfo();
        const localConfig = getLocalConfigOrThrow();
        const cwd = process.cwd();

        const mainJsFile = path.join(cwd, MAIN_FILE);
        if (!fs.existsSync(mainJsFile)) {
            throw new Error('The "main.js" file not found in the current directory. Call "apify init" to create it.');
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

RunCommand.description = 'Runs the actor locally in the current directory.\n'
    + 'The command runs a npm start script in the current directory. It sets various APIFY_XYZ environment variables '
    + 'in order to provide a working execution environment for the actor. For example, this causes '
    + 'the actor input, as well as all other data in key-value stores, '
    + `datasets or request queues to be stored in the "${DEFAULT_LOCAL_STORAGE_DIR}" directory, `
    + 'rather than on the Apify platform.\n\n'
    + 'NOTE: You can override behaviour for your actor in package.json under scripts.start. '
    + 'You can set up your own main file or environment variables by changing start script value.';

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
