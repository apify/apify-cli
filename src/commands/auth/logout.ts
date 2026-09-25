import { existsSync } from 'node:fs';
import process from 'node:process';

import { APIFY_ENV_VARS } from '@apify/consts';

import {
	getActiveProfileId,
	listProfiles,
	profileLabel,
	removeAllProfiles,
	removeProfile,
} from '../../lib/auth-file.js';
import { invalidEnvTokenMessage, readEnvToken, requireProfile } from '../../lib/auth.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags, YesFlag } from '../../lib/command-framework/flags.js';
import { AUTH_FILE_PATH, CommandExitCodes } from '../../lib/consts.js';
import { clearKeyringSecrets } from '../../lib/credentials.js';
import { updateUserId } from '../../lib/hooks/telemetry/useTelemetryState.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { error, info, success, warning } from '../../lib/outputs.js';
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
		{
			description: 'Log out of one stored account and keep the active one.',
			command: 'apify logout --profile my-org',
		},
		{
			description: 'Log out of every stored account without a prompt.',
			command: 'apify logout --all --yes',
		},
	];

	static override flags = {
		profile: Flags.string({
			description: 'The stored account to log out of, by name or user ID. See "apify auth list".',
			exclusive: ['all'],
		}),
		all: Flags.boolean({
			description: 'Log out of every stored account.',
			exclusive: ['profile'],
		}),
		...YesFlag(),
	};

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-logout';

	async run() {
		if (!this.flags.profile && !existsSync(AUTH_FILE_PATH())) {
			// The fixed-name keyring entries outlive the file they were stored beside.
			await clearKeyringSecrets();
			info({ message: 'You are not logged in.' });
		} else {
			const done = this.flags.all ? await this.logOutOfAll() : await this.logOutOf(this.flags.profile);
			if (!done) return;
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

	private async logOutOf(nameOrId: string | undefined): Promise<boolean> {
		// Read before either step runs: once the profile is gone, nothing names the keyring entries it owns.
		const activeProfileId = getActiveProfileId();
		const targetId = nameOrId ? (await requireProfile(nameOrId)).id : activeProfileId;
		const isActive = targetId === activeProfileId;

		// Both steps are attempted even when the first one fails, so neither the secrets nor the
		// profile are left behind just because the other could not be removed.
		const keyringError = await clearKeyringSecrets(targetId, { keepLegacy: !isActive }).then(
			() => null,
			(err: unknown) => err,
		);

		let profileError: unknown = null;
		let result: ReturnType<typeof removeProfile> = {};
		try {
			result = removeProfile(targetId);
		} catch (err) {
			profileError = err;
		}

		if (keyringError || profileError) {
			error({ message: partialLogoutMessage(targetId, keyringError, profileError) });
			process.exitCode = CommandExitCodes.RunFailed;
			return false;
		}

		const { removed, active } = result;

		if (!isActive) {
			success({
				message: `You are logged out of ${profileLabel(removed!)}.${active ? ` ${profileLabel(active)} is still the active account.` : ''}`,
			});
			return true;
		}

		await updateUserId(active?.id ?? null);

		if (active) {
			success({
				message: `You are logged out${removed ? ` of ${profileLabel(removed)}` : ''}. ${profileLabel(active)} is now the active account.`,
			});
		} else {
			success({ message: 'You are logged out from your Apify account.' });
		}

		return true;
	}

	private async logOutOfAll(): Promise<boolean> {
		const profiles = listProfiles();

		if (profiles.length && !this.flags.yes) {
			const confirmed = await useYesNoConfirm({
				message: `Log out of ${profiles.length === 1 ? 'your stored account' : `all ${profiles.length} stored accounts`}?`,
				errorMessageForStdin: 'Use --yes to log out of every stored account without a prompt.',
			});

			if (!confirmed) {
				info({ message: 'Logout was cancelled.' });
				return false;
			}
		}

		const keyringErrors: unknown[] = [];
		for (const id of new Set([getActiveProfileId(), ...profiles.map((p) => p.id)])) {
			await clearKeyringSecrets(id).catch((err: unknown) => keyringErrors.push(err));
		}

		let profileError: unknown = null;
		try {
			removeAllProfiles();
		} catch (err) {
			profileError = err;
		}

		if (keyringErrors.length || profileError) {
			error({ message: partialLogoutMessage(undefined, keyringErrors[0], profileError) });
			process.exitCode = CommandExitCodes.RunFailed;
			return false;
		}

		await updateUserId(null);
		success({ message: 'You are logged out of all your Apify accounts.' });
		return true;
	}
}

function reasonOf(err: unknown) {
	return err instanceof Error ? err.message : String(err);
}

function partialLogoutMessage(profileId: string | undefined, keyringError: unknown, profileError: unknown) {
	const keyringPart = keyringError
		? `Your secrets are still in the OS keyring${profileId ? ` under the account ${profileId}` : ''}; delete them with your OS keyring app.`
		: 'Your secrets were removed from the OS keyring.';

	const profilePart = profileError
		? `Your account is still in ${AUTH_FILE_PATH()}; delete that file to finish logging out.`
		: `Your account was removed from ${AUTH_FILE_PATH()}.`;

	const reasons = [keyringError, profileError].filter(Boolean).map(reasonOf).join(' ');

	return `Logout did not finish. ${keyringPart} ${profilePart} ${reasons}`;
}
