const { ApifyCommand } = require('../../lib/apify_command');
const { addSecret } = require('../../lib/secrets');

class AddCommand extends ApifyCommand {
    async run() {
        const { args } = await this.parse(AddCommand);
        const { name, value } = args;

        addSecret(name, value);
    }
}

AddCommand.description = 'Adds a new secret value.\nThe secrets are stored to a file at ~/.apify';

AddCommand.args = [
    {
        name: 'name',
        required: true,
        description: 'Name of the secret',
    },
    {
        name: 'value',
        required: true,
        description: 'Value of the secret',
    },
];

module.exports = AddCommand;
