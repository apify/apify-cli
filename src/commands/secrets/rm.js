const { ApifyCommand } = require('../../lib/apify_command');
const { removeSecret } = require('../../lib/secrets');

class RmCommand extends ApifyCommand {
    async run() {
        const { args } = this.parse(RmCommand);
        const { name } = args;

        removeSecret(name);
    }
}

RmCommand.description = 'Removes the secret environment variable.';

RmCommand.args = [
    {
        name: 'name',
        required: true,
        description: 'Name of the secret',
    },
];

module.exports = RmCommand;
