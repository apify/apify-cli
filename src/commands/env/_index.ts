import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { EnvDiffCommand } from './diff.js';
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
		{
			description: `Check that '.env' matches the platform, for example in CI.`,
			command: 'apify env diff',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-env';

	static override subcommands = [EnvDiffCommand, EnvLsCommand];

	async run() {
		this.printHelp();
	}
}
