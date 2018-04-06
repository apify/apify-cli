const { ApifyCommand } = require('../lib/apify_command');
const { flags: flagsHelper } = require('@oclif/command');
const { ACT_TASK_STATUSES } = require('apify-shared/consts');
const { getLocalConfig, getLoggedClientOrError } = require('../lib/utils');
const outputs = require('../lib/outputs');

class CallCommand extends ApifyCommand {
    async run() {
        const { args, flags } = this.parse(CallCommand);
        const localConfig = await getLocalConfig();
        const runOpts = {
            actId: args.actId || localConfig.actId,
            waitForFinish: 120,
        };

        ['build', 'timeout', 'memory'].forEach((opt) => {
            if (flags[opt]) runOpts[opt] = flags[opt];
        });

        const apifyClient = await getLoggedClientOrError();

        outputs.run(`Calling act ${runOpts.actId}...`);

        const run = await apifyClient.acts.runAct(runOpts);

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
    '';

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
