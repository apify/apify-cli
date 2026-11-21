import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { EnvLsCommand } from './ls.js';

export class EnvIndexCommand extends ApifyCommand<typeof EnvIndexCommand> {
	static override name = 'env' as const;

	static override description = `Manages the environment variables of an Actor version on the Apify platform.`;

	static override group = 'Apify Console';

	static override examples = [
		{
			description: 'List the environment variables of the Actor in the current directory.',
			command: 'apify env ls',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-env';

	static override subcommands = [EnvLsCommand];

	async run() {
		this.printHelp();
	}
}
