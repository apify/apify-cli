const { ApifyCommand } = require('../lib/apify_command');
const { flags: flagsHelper } = require('@oclif/command');
const fs = require('fs');
const path = require('path');
const execWithLog = require('../lib/exec');
const { LOCAL_ENV_VARS, MAIN_FILE } = require('../lib/consts');
const { ENV_VARS } = require('apify-shared/consts');
const { getLocalUserInfo, purgeDefaultQueue, purgeDefaultKeyValueStore, purgeDefaultDataset, getLocalConfigOrThrow } = require('../lib/utils');
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

        if (proxy && proxy.password) LOCAL_ENV_VARS[ENV_VARS.PROXY_PASSWORD] = proxy.password;
        if (userId) LOCAL_ENV_VARS[ENV_VARS.USER_ID] = userId;
        if (token) LOCAL_ENV_VARS[ENV_VARS.TOKEN] = token;

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
        const localEnvVars = {};
        if (localConfig.version && localConfig.version.envVars) {
            localConfig.version.envVars.forEach((envVar) => {
                if (envVar.name && envVar.value) localEnvVars[envVar.name] = envVar.value;
            });
        }
        // NOTE: User can overwrite env vars
        const env = Object.assign(LOCAL_ENV_VARS, localEnvVars, process.env);

        await execWithLog('node', [MAIN_FILE], { env });
    }
}

// TODO: we should describe which env vars are set here:

RunCommand.description = 'Runs the act locally in the current directory.\n' +
    'The command runs a Node.js process with the act in the current directory. It sets various APIFY_XYZ environment variables ' +
    'in order to provide a working execution environment for the act. For example, this causes ' +
    'the act input, as well as all other data in key-value stores, datasets or request queues to be stored in the "apify_local" directory, ' +
    'rather than on the Apify platform.';

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
