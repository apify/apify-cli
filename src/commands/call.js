const { ApifyCommand } = require('../lib/apify_command');
const { flags: flagsHelper } = require('@oclif/command');
const { ACT_TASK_STATUSES, ACT_TASK_TYPES } = require('apify-shared/consts');
const { getLocalConfig, getLoggedClientOrThrow, getLocalInput, outputLogStream } = require('../lib/utils');
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
            waitForFinish: 2, // NOTE: We need to wait some time to Apify open stream and we can create connection
        };
        const waitForFinishMillis = isNaN(flags.waitForFinish) ? undefined : parseInt(flags.waitForFinish, 10) * 1000;

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
            run = await apifyClient.acts.runAct(runOpts);
        } catch (err) {
            // TODO: Better error message in apify-client-js
            if (err.type === 'record-not-found') throw new Error(`Act ${runOpts.actId} not found!`);
            else throw err;
        }

        outputs.link('Act run detail', `https://my.apify.com/acts/${run.actId}#/runs/${run.id}`);

        try {
            await outputLogStream(run.id, waitForFinishMillis);
        } catch (err) {
            outputs.warning('Can not get log:');
            console.error(err);
        }

        run = await apifyClient.acts.getRun({ actId: run.actId, runId: run.id });
        console.dir(run);

        if (run.status === ACT_TASK_STATUSES.SUCCEEDED) {
            outputs.success('Act finished!');
        } else if (run.status === ACT_TASK_STATUSES.RUNNING) {
            outputs.warning('Act still running!');
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
    'wait-for-finish': flagsHelper.string({
        char: 'w',
        description: 'Seconds for waiting to run to finish, if no value passed, it waits forever.',
        required: false,
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
