const { Command } = require('@oclif/command');
const { showHelpForCommand } = require('../../lib/utils');

class ActorIndexCommand extends Command {
    static async run() {
        showHelpForCommand('actor');
    }
}

ActorIndexCommand.description = 'TBD.\n\n'
    + 'TODO: Some clever description and example of usage';

module.exports = ActorIndexCommand;
