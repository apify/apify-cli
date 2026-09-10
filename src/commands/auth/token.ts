import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { getOAuthMetadata } from '../../lib/credentials.js';
import { simpleLog } from '../../lib/outputs.js';
import { getLocalUserInfo, getLoggedClientOrThrow } from '../../lib/utils.js';

export class AuthTokenCommand extends ApifyCommand<typeof AuthTokenCommand> {
	static override name = 'token' as const;

	static override description =
		'Prints the current API token for the Apify CLI.\n' +
		'Tokens issued by an OAuth login expire after about an hour; the expiry is noted on stderr.';

	static override examples = [
		{
			description: 'Print the stored API token to stdout (use with care — it is a secret).',
			command: 'apify auth token',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-auth-token';

	async run() {
		await getLoggedClientOrThrow();
		const userInfo = await getLocalUserInfo();

		if (userInfo.token) {
			simpleLog({ message: userInfo.token, stdout: true });

			const oauth = getOAuthMetadata();
			if (oauth) {
				simpleLog({ message: `Note: this token expires at ${new Date(oauth.expiresAt).toISOString()}.` });
			}
		}
	}
}
