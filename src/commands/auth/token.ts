import { resolveAuth } from '../../lib/auth.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class AuthTokenCommand extends ApifyCommand<typeof AuthTokenCommand> {
	static override name = 'token' as const;

	static override description =
		'Prints the API token the CLI would use, resolved from APIFY_TOKEN or the stored login.';

	static override examples = [
		{
			description: 'Print the resolved API token to stdout (use with care — it is a secret).',
			command: 'apify auth token',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-auth-token';

	async run() {
		await getLoggedClientOrThrow();
		const auth = await resolveAuth();

		if (auth) {
			simpleLog({ message: auth.token, stdout: true });
		}
	}
}
