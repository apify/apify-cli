const { flags: flagsHelper } = require('@oclif/command');
const { ACT_JOB_STATUSES } = require('@apify/consts');
const { ApifyCommand } = require('../lib/apify_command');
const { getLocalConfig, getLoggedClientOrThrow,
    getLocalUserInfo, getLocalInput, outputJobLog } = require('../lib/utils');
const outputs = require('../lib/outputs');

// TODO: Show full error messages and HTTP codes, this is not great:
// jan:testx$ apify call help
// Run: Calling act help...
// Error: [record-not-found]

class CallCommand extends ApifyCommand {
    async run() {
        const { args, flags } = this.parse(CallCommand);
        const localConfig = getLocalConfig() || {};
        const apifyClient = await getLoggedClientOrThrow();
        const userInfo = await getLocalUserInfo();
        const usernameOrId = userInfo.username || userInfo.id;

        const forceActorId = args.actId;
        let actorId;
        if (forceActorId) {
            const actor = await apifyClient.acts.getAct({ actId: forceActorId });
            if (!actor) throw new Error(`Cannot find actor with ID '${forceActorId}' in your account.`);
            actorId = actor.username ? `${actor.username}/${actor.name}` : actor.id;
        } else {
            actorId = `${usernameOrId}/${localConfig.name}`;
            const actor = await apifyClient.acts.getAct({ actId: actorId });
            if (!actor) {
                throw new Error(`Cannot find actor with ID '${actorId}' `
                    + 'in your account. Call "apify push" to push this actor to Apify platform.');
            }
        }

        const runOpts = {
            actId: actorId,
            waitForFinish: 2, // NOTE: We need to wait some time to Apify open stream and we can create connection
        };
        const waitForFinishMillis = Number.isNaN(flags.waitForFinish)
            ? undefined
            : parseInt(flags.waitForFinish, 10) * 1000;

        ['build', 'timeout', 'memory'].forEach((opt) => {
            if (flags[opt]) runOpts[opt] = flags[opt];
        });

        // Get input for act
        const localInput = getLocalInput();
        if (localInput) Object.assign(runOpts, localInput);

        outputs.run(`Calling actor ${runOpts.actId}`);

        let run;
        try {
            run = await apifyClient.acts.runAct(runOpts);
        } catch (err) {
            // TODO: Better error message in apify-client-js
            if (err.type === 'record-not-found') throw new Error(`Actor ${runOpts.actId} not found!`);
            else throw err;
        }

        try {
            await outputJobLog(run, waitForFinishMillis);
        } catch (err) {
            outputs.warning('Can not get log:');
            console.error(err);
        }

        run = await apifyClient.acts.getRun({ actId: run.actId, runId: run.id });
        console.dir(run);

        outputs.link('Actor run detail', `https://console.apify.com/actors/${run.actId}#/runs/${run.id}`);

        if (run.status === ACT_JOB_STATUSES.SUCCEEDED) {
            outputs.success('Actor finished.');
        } else if (run.status === ACT_JOB_STATUSES.RUNNING) {
            outputs.warning('Actor is still running!');
        } else {
            outputs.error('Actor failed!');
        }
    }
}

CallCommand.description = 'Runs a specific actor remotely on the Apify cloud platform.\n'
    + 'The actor is run under your current Apify account, therefore you need to be logged in by calling "apify login". '
    + 'It takes input for the actor from the default local key-value store by default.';

CallCommand.flags = {
    build: flagsHelper.string({
        char: 'b',
        description: 'Tag or number of the build to run (e.g. "latest" or "1.2.34").',
        required: false,
    }),
    timeout: flagsHelper.string({
        char: 't',
        description: 'Timeout for the actor run in seconds. Zero value means there is no timeout.',
        required: false,
        parse: (input) => parseInt(input, 10),
    }),
    memory: flagsHelper.string({
        char: 'm',
        description: 'Amount of memory allocated for the actor run, in megabytes.',
        required: false,
        parse: (input) => parseInt(input, 10),
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
        description: 'Name or ID of the actor to run (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). '
            + 'If not provided, the command runs the remote actor specified in the "apify.json" file.',
    },
];

module.exports = CallCommand;
