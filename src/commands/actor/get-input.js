const { ApifyCommand } = require('../../lib/apify_command');
const { outputInputFromDefaultStore } = require('../../lib/actor');

class GetInputCommand extends ApifyCommand {
    async run() {
        await outputInputFromDefaultStore();
    }
}

GetInputCommand.description = 'Gets the actor input value from the default key-value store associated with the actor run.';

GetInputCommand.args = [
    {
        name: 'key',
        required: true,
        description: 'Key of the record in key-value store',
    },
];

module.exports = GetInputCommand;
