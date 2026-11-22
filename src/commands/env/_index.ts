import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { EnvLsCommand } from './ls.js';
import { EnvPullCommand } from './pull.js';
import { EnvPushCommand } from './push.js';
import { EnvRmCommand } from './rm.js';
import { EnvSetCommand } from './set.js';

export class EnvIndexCommand extends ApifyCommand<typeof EnvIndexCommand> {
	static override name = 'env' as const;

	static override description =
		'Manage the environment variables of an Actor version on the Apify platform, and keep them in sync with a local .env file. Changes need a rebuild before runs see them.';

	static override group = 'Local Actor Development';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-env';

	static override subcommands = [EnvLsCommand, EnvSetCommand, EnvRmCommand, EnvPushCommand, EnvPullCommand];

	async run() {
		this.printHelp();
	}
}
