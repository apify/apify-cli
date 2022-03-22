const { ApifyCommand } = require('../../lib/apify_command');
const { outputInputFromDefaultStore } = require('../../lib/actor');

class GetInputCommand extends ApifyCommand {
    async run() {
        await outputInputFromDefaultStore()
    }
}

GetInputCommand.description = 'Gets a value from the default KeyValueStore associated with the actor.';

GetInputCommand.args = [
    {
        name: 'key',
        required: true,
        description: 'Key of the record in key-value store.',
    },
];

module.exports = GetInputCommand;
