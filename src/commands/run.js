const { ApifyCommand } = require('../lib/apify_command');
const { flags: flagsHelper } = require('@oclif/command');
const fs = require('fs');
const path = require('path');
const execWithLog = require('../lib/exec');
const { LOCAL_ENV_VARS, MAIN_FILE } = require('../lib/consts');
const { ENV_VARS } = require('apify-shared/consts');
const { getLocalUserInfo, purgeDefaultQueue, purgeDefaultKeyValueStore, purgeDefaultDataset } = require('../lib/utils');
const { info } = require('../lib/outputs');

class RunCommand extends ApifyCommand {
    async run() {
        const { flags } = this.parse(RunCommand);
        const { proxy, id: userId, token } = getLocalUserInfo();
        const apifyLocalEnvVars = LOCAL_ENV_VARS;
        const cwd = process.cwd();

        const mainJsFile = path.join(cwd, MAIN_FILE);
        if (!fs.existsSync(mainJsFile)) {
            throw new Error('File main.js is missing in current dir! Call "apify init" to create it.');
        }

        if (proxy && proxy.password) apifyLocalEnvVars[ENV_VARS.PROXY_PASSWORD] = proxy.password;
        if (userId) apifyLocalEnvVars[ENV_VARS.USER_ID] = userId;
        if (token) apifyLocalEnvVars[ENV_VARS.TOKEN] = token;

        // Purge stores
        if (flags.purgeStores) {
            await Promise.all([purgeDefaultQueue(cwd), purgeDefaultKeyValueStore(cwd), purgeDefaultDataset(cwd)]);
            info('All default local stores were purge.');
        } else if (flags.purgeQueue) {
            await purgeDefaultQueue(cwd);
            info('Default page queue was purge.');
        } else if (flags.purgeDataset) {
            await purgeDefaultDataset(cwd);
            info('Default page dataset was purge.');
        } else if (flags.purgeKeyValueStore) {
            await purgeDefaultKeyValueStore(cwd);
            info('Default key-value store was purge.');
        }

        // NOTE: User can overwrite env vars
        const env = Object.assign(apifyLocalEnvVars, process.env);

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
    'purge-stores': flagsHelper.boolean({
        char: 'p',
        description: 'It deletes all default local folder stores without "INPUT.*" before a run.',
        required: false,
    }),
    'purge-queue': flagsHelper.boolean({
        description: 'It deletes default page queue before a run.',
        required: false,
    }),
    'purge-dataset': flagsHelper.boolean({
        description: 'It deletes default datatset folder before a run.',
        required: false,
    }),
    'purge-key-value-store': flagsHelper.boolean({
        description: 'It deletes all files from default key-value store folder without "INPUT.*" file before a run.',
        required: false,
    }),
};

module.exports = RunCommand;
