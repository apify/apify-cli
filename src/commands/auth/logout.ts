import { APIFY_ENV_VARS } from '@apify/consts';

import { getActiveProfileId, removeActiveProfile } from '../../lib/auth-file.js';
import { invalidEnvTokenMessage, readEnvToken } from '../../lib/auth.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { AUTH_FILE_PATH } from '../../lib/consts.js';
import { clearKeyringSecrets } from '../../lib/credentials.js';
import { updateUserId } from '../../lib/hooks/telemetry/useTelemetryState.js';
import { success, warning } from '../../lib/outputs.js';
import { tildify } from '../../lib/utils.js';

export class AuthLogoutCommand extends ApifyCommand<typeof AuthLogoutCommand> {
	static override name = 'logout' as const;

	static override description =
		`Removes authentication by deleting your API token and account information from '${tildify(AUTH_FILE_PATH())}'.\n` +
		`Run 'apify login' to authenticate again.`;

	static override group = 'Authentication';

	static override examples = [
		{
			description: 'Remove the stored Apify credentials.',
			command: 'apify logout',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-logout';

	async run() {
		// The keyring goes first: `auth.json` is the only index of what it holds, so removing the
		// profile would strand its entries.
		await clearKeyringSecrets(getActiveProfileId());
		removeActiveProfile();

		await updateUserId(null);

		success({ message: 'You are logged out from your Apify account.' });

		const envToken = readEnvToken();
		if (envToken.kind === 'token') {
			warning({
				message: `${APIFY_ENV_VARS.TOKEN} is still set, so commands stay authenticated with that token.`,
			});
		} else if (envToken.kind === 'invalid') {
			warning({ message: invalidEnvTokenMessage(envToken.raw) });
		}
	}
}
