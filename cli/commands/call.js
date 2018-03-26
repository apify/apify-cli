const { ApifyCommand } = require('../lib/apify_command');
const { flags } = require('@oclif/command');
const { getLocalConfig, getLoggedClientOrError } = require('../lib/utils');

class CallCommand extends ApifyCommand {
    async run() {
        const { flags, args } = this.parse(CallCommand);
        const localConfig = await getLocalConfig();
        const { actId } = args || localConfig;
        if (!actId) throw new Error('ActId is missing');

        const apifyClient = await getLoggedClientOrError();

        await apifyClient.acts.runAct({ actId });

        success('Act finished!');
    }
}

CallCommand.description = `
Call act on Apify.
`;

module.exports = CallCommand;
