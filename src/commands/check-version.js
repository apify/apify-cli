const { Flags: flagsHelper } = require('@oclif/core');

const { ApifyCommand } = require('../lib/apify_command');
const { checkLatestVersion } = require('../lib/version_check');

class CheckVersionCommand extends ApifyCommand {
    async run() {
        const { flags } = await this.parse(CheckVersionCommand);
        await checkLatestVersion(flags.enforceUpdate);
    }
}

CheckVersionCommand.description = 'Checks that installed Apify CLI version is up to date.';

CheckVersionCommand.flags = {
    'enforce-update': flagsHelper.boolean({
        char: 'e',
        description: '[Optional] Enforce version update from NPM',
        required: false,
    }),
};

CheckVersionCommand.hidden = true;

CheckVersionCommand.aliases = ['cv'];

module.exports = CheckVersionCommand;
