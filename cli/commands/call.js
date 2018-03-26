const { ApifyCommand } = require('../lib/apify_command');
const { ACT_TASK_STATUSES } = require('apify-shared/consts')
const { flags } = require('@oclif/command');
const { getLocalConfig, getLoggedClientOrError } = require('../lib/utils');
const outputs = require('../lib/outputs');

class CallCommand extends ApifyCommand {
    async run() {
        const { flags, args } = this.parse(CallCommand);
        const localConfig = await getLocalConfig();
        const actId = args.actId || localConfig.actId;

        const apifyClient = await getLoggedClientOrError();

        outputs.run(`Calling act ${actId}`)

        const run = await apifyClient.acts.runAct({ actId, waitForFinish: 120 });

        if (run.status === ACT_TASK_STATUSES.SUCCEEDED) {
            outputs.success('Act finished!');
        } else {
            outputs.error('Act failed!');
        }
    }
}

CallCommand.description = `
Call act on Apify.
`;

module.exports = CallCommand;
