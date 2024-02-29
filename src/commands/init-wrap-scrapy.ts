import { Args } from '@oclif/core';

import { ApifyCommand } from '../lib/apify_command.js';
import { info } from '../lib/outputs.js';
import { wrapScrapyProject } from '../lib/projects/scrapy/wrapScrapyProject.js';

export class WrapScrapyCommand extends ApifyCommand<typeof WrapScrapyCommand> {
    static override description = `Wraps your existing Scrapy project to work like an Apify Actor.

It adds the following features:
- Automatic retry of failed requests
- Automatic proxy rotation
- Automatic user agent rotation
...
`;

    static override args = {
        path: Args.string({
            required: false,
            description: 'Optional path to your scrapy project. If not provided, the current directory is used.',
        }),
    };

    static override hidden = true;

    async run() {
        await wrapScrapyProject({ projectPath: this.args.path });

        info('Scrapy project wrapped successfully.');
    }
}
