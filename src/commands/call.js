const { ApifyCommand } = require('../lib/apify_command');
const { flags: flagsHelper } = require('@oclif/command');
const { ACT_TASK_STATUSES, ACT_TASK_TYPES } = require('apify-shared/consts');
const { getLocalConfig, getLoggedClientOrThrow, getLocalInput, waitForTaskFinish } = require('../lib/utils');
const outputs = require('../lib/outputs');

// TODO: Show full error messages and HTTP codes, this is not great:
// jan:testx$ apify call help
// Run: Calling act help...
// Error: [record-not-found]

class CallCommand extends ApifyCommand {
    async run() {
        const { args, flags } = this.parse(CallCommand);
        const localConfig = getLocalConfig() || {};
        const runOpts = {
            actId: args.actId || localConfig.actId,
        };

        ['build', 'timeout', 'memory'].forEach((opt) => {
            if (flags[opt]) runOpts[opt] = flags[opt];
        });

        // Get input for act
        const localInput = getLocalInput();
        if (localInput) Object.assign(runOpts, localInput);

        const apifyClient = await getLoggedClientOrThrow();

        outputs.run(`Calling act ${runOpts.actId}`);

        let run;
        try {
            run = await apifyClient.acts.runAct(runOpts).then(runDetail => waitForTaskFinish(apifyClient, runDetail, ACT_TASK_TYPES.RUN));
        } catch (err) {
            // TODO: Better error message in apify-client-js
            if (err.type === 'record-not-found') throw new Error(`Act ${runOpts.actId} not found!`);
            else throw err;
        }
        console.dir(run);

        const log = await apifyClient.logs.getLog({ logId: run.id });
        console.log(log);

        if (run.status === ACT_TASK_STATUSES.SUCCEEDED) {
            outputs.success('Act finished!');
        } else {
            outputs.error('Act failed!');
        }
    }
}

CallCommand.description = 'Runs the act remotely on the Apify platform.\n' +
    'The act is run under your current Apify account, therefore you need to be logged in by calling "apify login". ' +
    'It takes input for the act from default local key-value store by default.';

CallCommand.flags = {
    build: flagsHelper.string({
        char: 'b',
        description: 'Tag or number of the build to run (e.g. "latest" or "1.2.34").',
        required: false,
    }),
    timeout: flagsHelper.string({
        char: 't',
        description: 'Timeout for the act run in seconds. Zero value means there is no timeout.',
        required: false,
        parse: input => parseInt(input, 10),
    }),
    memory: flagsHelper.string({
        char: 'm',
        description: 'Amount of memory allocated for the act run, in megabytes.',
        required: false,
        parse: input => parseInt(input, 10),
    }),
};

CallCommand.args = [
    {
        name: 'actId',
        required: false,
        description: 'Name or ID of the act to run (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). ' +
            'If not provided, the command runs the remote act specified in the "apify.json" file.',
    },
];

module.exports = CallCommand;
