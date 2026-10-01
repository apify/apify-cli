import process from 'node:process';

import { APIFY_ENV_VARS } from '@apify/consts';

import { getActiveProfileId, removeActiveProfile } from '../../lib/auth-file.js';
import { invalidEnvTokenMessage, readEnvToken } from '../../lib/auth.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { AUTH_FILE_PATH, CommandExitCodes } from '../../lib/consts.js';
import {
	clearKeyringSecrets,
	describeLeftovers,
	type KeyringLeftover,
	leftoverReasons,
} from '../../lib/credentials.js';
import { updateUserId } from '../../lib/hooks/telemetry/useTelemetryState.js';
import { error, success, warning } from '../../lib/outputs.js';
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
		// Read before either step runs: once the profile is gone, nothing names the keyring entries it owns.
		const activeProfileId = getActiveProfileId();

		// Both steps are attempted even when the first one fails, so neither the secrets nor the
		// profile are left behind just because the other could not be removed.
		const leftovers = await clearKeyringSecrets(activeProfileId);

		let profileError: unknown = null;
		try {
			removeActiveProfile();
		} catch (err) {
			profileError = err;
		}

		// The account is off disk whenever the profile step succeeded, so the telemetry ID goes too.
		if (!profileError) await updateUserId(null);

		if (leftovers.length || profileError) {
			error({ message: partialLogoutMessage(leftovers, profileError) });
			process.exitCode = CommandExitCodes.RunFailed;
		} else {
			success({ message: 'You are logged out from your Apify account.' });
		}

		// Said either way: a half-finished logout is when this matters most.
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

function partialLogoutMessage(leftovers: KeyringLeftover[], profileError: unknown) {
	const keyringPart = leftovers.length
		? `Your secrets are still in the OS keyring at ${describeLeftovers(leftovers)}; delete them with your OS keyring app.`
		: 'Your secrets were removed from the OS keyring.';

	const profilePart = profileError
		? `Your account is still in ${tildify(AUTH_FILE_PATH())}; delete that file to finish logging out.`
		: `Your account was removed from ${tildify(AUTH_FILE_PATH())}.`;

	const reasons = [leftoverReasons(leftovers), profileError ? reasonOf(profileError) : ''].filter(Boolean).join(' ');

	return `Logout did not finish. ${keyringPart} ${profilePart} The reason was: ${reasons}`;
}
