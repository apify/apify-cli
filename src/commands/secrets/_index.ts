import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { LOCAL_CONFIG_PATH } from '../../lib/consts.js';
import { SecretsAddCommand } from './add.js';
import { SecretsLsCommand } from './ls.js';
import { SecretsRmCommand } from './rm.js';

export class SecretsIndexCommand extends ApifyCommand<typeof SecretsIndexCommand> {
	static override name = 'secrets' as const;

	static override description = `Deprecated: use .env and apify env instead. Manage locally stored secrets that '${LOCAL_CONFIG_PATH}' environment variables reference with the "@" prefix (e.g. "@mySecret") for local runs. To set secrets on the platform, use apify env set --secret.`;

	static override group = 'Authentication';

	static override deprecated = true;

	static override examples = [
		{
			description: 'Store a secret called "mySecret".',
			command: 'apify secrets add mySecret TopSecretValue123',
		},
		{
			description: `Reference the secret from .actor/actor.json using the "@" prefix, e.g. "environmentVariables": { "SECRET_ENV_VAR": "@mySecret" }, then run the Actor locally.`,
			command: 'apify run',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-secrets';

	static override subcommands = [SecretsAddCommand, SecretsLsCommand, SecretsRmCommand];

	async run() {
		this.printHelp();
	}
}
