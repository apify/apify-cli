import process from 'node:process';

import { APIFY_ENV_VARS } from '@apify/consts';

import { getActiveProfileId, profileLabel, removeActiveProfile } from '../../lib/auth-file.js';
import { invalidEnvTokenMessage, readEnvToken } from '../../lib/auth.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { AUTH_FILE_PATH, CommandExitCodes } from '../../lib/consts.js';
import { clearKeyringSecrets } from '../../lib/credentials.js';
import { updateUserId } from '../../lib/hooks/telemetry/useTelemetryState.js';
import { error, success, warning } from '../../lib/outputs.js';
import { tildify } from '../../lib/utils.js';

export class AuthLogoutCommand extends ApifyCommand<typeof AuthLogoutCommand> {
	static override name = 'logout' as const;

	static override description =
		`Logs out of the active account by deleting its API token and account information from '${tildify(AUTH_FILE_PATH())}'.\n` +
		`If other accounts are stored, the most recently logged-in one becomes active.\n` +
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
		// Read before either step runs: once the profile is gone, nothing names the keyring entries it owns.
		const activeProfileId = getActiveProfileId();

		// Both steps are attempted even when the first one fails, so neither the secrets nor the
		// profile are left behind just because the other could not be removed.
		const keyringError = await clearKeyringSecrets(activeProfileId).then(
			() => null,
			(err: unknown) => err,
		);

		let profileError: unknown = null;
		let result: ReturnType<typeof removeActiveProfile> = {};
		try {
			result = removeActiveProfile();
		} catch (err) {
			profileError = err;
		}

		if (keyringError || profileError) {
			error({ message: partialLogoutMessage(activeProfileId, keyringError, profileError) });
			process.exitCode = CommandExitCodes.RunFailed;
			return;
		}

		const { removed, active } = result;

		await updateUserId(active?.id ?? null);

		if (active) {
			success({
				message: `You are logged out${removed ? ` of ${profileLabel(removed)}` : ''}. ${profileLabel(active)} is now the active account.`,
			});
		} else {
			success({ message: 'You are logged out from your Apify account.' });
		}

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

function reasonOf(err: unknown) {
	return err instanceof Error ? err.message : String(err);
}

function partialLogoutMessage(activeProfileId: string | undefined, keyringError: unknown, profileError: unknown) {
	const keyringPart = keyringError
		? `Your secrets are still in the OS keyring${activeProfileId ? ` under the account ${activeProfileId}` : ''}; delete them with your OS keyring app.`
		: 'Your secrets were removed from the OS keyring.';

	const profilePart = profileError
		? `Your account is still in ${AUTH_FILE_PATH()}; delete that file to finish logging out.`
		: `Your account was removed from ${AUTH_FILE_PATH()}.`;

	const reasons = [keyringError, profileError].filter(Boolean).map(reasonOf).join(' ');

	return `Logout did not finish. ${keyringPart} ${profilePart} ${reasons}`;
}
