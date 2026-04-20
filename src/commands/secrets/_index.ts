import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { LOCAL_CONFIG_PATH } from '../../lib/consts.js';
import { SecretsAddCommand } from './add.js';
import { SecretsLsCommand } from './ls.js';
import { SecretsRmCommand } from './rm.js';

export class SecretsIndexCommand extends ApifyCommand<typeof SecretsIndexCommand> {
	static override name = 'secrets' as const;

	static override description =
		`Manage locally stored secrets that can be referenced from '${LOCAL_CONFIG_PATH}' environment variables using the "@" prefix (e.g. "@mySecret"). Secrets are uploaded alongside the Actor and stored encrypted on the Apify platform.`;

	static override group = 'Authentication';

	static override examples = [
		{
			description: 'Store a secret called "mySecret".',
			command: 'apify secrets add mySecret TopSecretValue123',
		},
		{
			description: `Reference the secret from .actor/actor.json using the "@" prefix, e.g. "environmentVariables": { "SECRET_ENV_VAR": "@mySecret" }, then push as usual.`,
			command: 'apify push',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-secrets';

	static override subcommands = [SecretsAddCommand, SecretsLsCommand, SecretsRmCommand];

	async run() {
		this.printHelp();
	}
}
