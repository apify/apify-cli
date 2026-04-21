import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { removeSecret } from '../../lib/secrets.js';

export class SecretsRmCommand extends ApifyCommand<typeof SecretsRmCommand> {
	static override name = 'rm' as const;

	static override description = 'Permanently deletes a secret from your stored credentials.';

	static override examples = [
		{
			description: 'Delete a locally stored secret by name.',
			command: 'apify secrets rm mySecret',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-secrets-rm';

	static override args = {
		name: Args.string({
			required: true,
			description: 'Name of the secret.',
		}),
	};

	async run() {
		const { name } = this.args;

		removeSecret(name);
	}
}
