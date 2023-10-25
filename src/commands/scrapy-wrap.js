const { ApifyCommand } = require('../lib/apify_command');
const { wrapScrapyProject } = require('../lib/scrapy-wrapper/src/index');

class ScrapyWrapCommand extends ApifyCommand {
    static hidden = true;

    async run() {
        const { args } = this.parse(ScrapyWrapCommand);

        await wrapScrapyProject({ p: args.path });

        this.log('Scrapy project wrapped successfully.');
    }
}

ScrapyWrapCommand.description = `Enhances your existing Scrapy project with Apify's Scrapy middleware.

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
