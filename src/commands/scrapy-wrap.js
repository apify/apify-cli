const { ApifyCommand } = require('../lib/apify_command');
const { info } = require('../lib/outputs');
const { wrapScrapyProject } = require('../lib/scrapy-wrapper/src/index');

class ScrapyWrapCommand extends ApifyCommand {
    async run() {
        const { args } = this.parse(ScrapyWrapCommand);

        await wrapScrapyProject({ projectPath: args.path });

        info('Scrapy project wrapped successfully.');
    }
}

ScrapyWrapCommand.hidden = true;

ScrapyWrapCommand.description = `Wraps your existing Scrapy project to work like an Apify Actor.

It adds the following features:
- Automatic retry of failed requests
- Automatic proxy rotation
- Automatic user agent rotation
...
`;

ScrapyWrapCommand.args = [
    {
        name: 'path',
        required: false,
        description: 'Optional path to your scrapy project. If not provided, the current directory is used.',
    },
];

module.exports = ScrapyWrapCommand;
