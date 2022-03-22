const { ApifyCommand } = require('../../lib/apify_command');
const { outputRecordFromDefaultStore } = require('../../lib/actor');

class GetValueCommand extends ApifyCommand {
    async run() {
        const { args } = this.parse(GetValueCommand);
        const { key } = args;

        await outputRecordFromDefaultStore(key);
    }
}

GetValueCommand.description = 'Gets a value from the default key-value store associated with the actor run.';

GetValueCommand.args = [
    {
        name: 'key',
        required: true,
        description: 'Key of the record in key-value store',
    },
];

module.exports = GetValueCommand;
