const { Command } = require('@oclif/command');
const { showHelpForCommand } = require('../../lib/utils');

class SecretsIndexCommand extends Command {
    async run() {
        showHelpForCommand('secrets');
    }
}

SecretsIndexCommand.description = 'Manages your secrets environment variables.\n' +
    'Adds or removes your secrets. After adding secret you can use it actor environment variables with "@" prefix.\n' +
    'For example:\n' +
    '$ apify secret:add myToken my_secret_token_value\n' +
    'usage in apify.json:\n\n' +
    '{\n' +
    '  "name": "my_actor",\n' +
    '  "env": { "TOKEN": "@myToken" },\n' +
    '  "version": "0.1\n' +
    '}\n\n' +
    'While we push actor to Apify platform,\n' +
    'value of myToken will be encrypted and used as environment variable.';

module.exports = SecretsIndexCommand;
