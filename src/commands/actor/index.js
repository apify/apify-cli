const { Command } = require('@oclif/command');
const { showHelpForCommand } = require('../../lib/utils');

class ActorIndexCommand extends Command {
    static async run() {
        showHelpForCommand('actor');
    }
}

ActorIndexCommand.description = 'Commands are designed to be used in actor runs. All commands are in PoC state, do not use in production environments.\n';

module.exports = ActorIndexCommand;
