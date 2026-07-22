import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { TemplatesLsCommand } from './ls.js';

export class TemplatesIndexCommand extends ApifyCommand<typeof TemplatesIndexCommand> {
	static override name = 'templates' as const;

	static override description = 'Explore the Actor templates used by "apify create".';

	static override group = 'Local Actor Development';

	static override subcommands = [TemplatesLsCommand];

	async run() {
		this.printHelp();
	}
}
