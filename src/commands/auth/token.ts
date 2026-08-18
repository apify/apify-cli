import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, resolveToken } from '../../lib/utils.js';

export class AuthTokenCommand extends ApifyCommand<typeof AuthTokenCommand> {
	static override name = 'token' as const;

	static override description = 'Prints the current API token for the Apify CLI.';

	static override examples = [
		{
			description: 'Print the API token in use to stdout (use with care — it is a secret).',
			command: 'apify auth token',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-auth-token';

	async run() {
		await getLoggedClientOrThrow();
		// Must match what the other commands actually authenticate with, so APIFY_TOKEN wins over the stored login.
		const token = await resolveToken();

		if (token) {
			simpleLog({ message: token, stdout: true });
		}
	}
}
