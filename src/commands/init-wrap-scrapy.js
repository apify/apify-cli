const { ApifyCommand } = require('../lib/apify_command');
const { info } = require('../lib/outputs');
const { wrapScrapyProject } = require('../lib/scrapy-wrapper/index');

class WrapScrapyCommand extends ApifyCommand {
    async run() {
        const { args } = this.parse(WrapScrapyCommand);

        await wrapScrapyProject({ projectPath: args.path });

        info('Scrapy project wrapped successfully.');
    }
}

WrapScrapyCommand.hidden = true;

WrapScrapyCommand.description = `Wraps your existing Scrapy project to work like an Apify Actor.

It adds the following features:
- Automatic retry of failed requests
- Automatic proxy rotation
- Automatic user agent rotation
...
`;

WrapScrapyCommand.args = [
    {
        name: 'path',
        required: false,
        description: 'Optional path to your scrapy project. If not provided, the current directory is used.',
    },
];

module.exports = WrapScrapyCommand;
