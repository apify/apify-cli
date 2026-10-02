import { resolveAuth } from '../../lib/auth.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { getOAuthMetadata } from '../../lib/credentials.js';
import { simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class AuthTokenCommand extends ApifyCommand<typeof AuthTokenCommand> {
	static override name = 'token' as const;

	static override description =
		`Prints the API token the CLI authenticates with, resolved from APIFY_TOKEN or the token from 'apify login'.\n` +
		'Tokens issued by an OAuth login expire after about an hour; the expiry is noted on stderr.';

	static override examples = [
		{
			description: `Print the resolved API token to stdout. Be careful with the output, it's a secret.`,
			command: 'apify auth token',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-auth-token';

	async run() {
		await getLoggedClientOrThrow();
		const auth = (await resolveAuth())!;

		simpleLog({ message: auth.token, stdout: true });

		const oauth = auth.source === 'stored' ? getOAuthMetadata() : undefined;
		if (oauth) {
			simpleLog({ message: `Note: this token expires at ${new Date(oauth.expiresAt).toISOString()}.` });
		}
	}
}
