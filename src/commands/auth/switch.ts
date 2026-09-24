import process from 'node:process';

import {
	ensureAuthFileCurrent,
	getActiveProfileId,
	listProfiles,
	profileLabel,
	setActiveProfile,
} from '../../lib/auth-file.js';
import {
	envTokenOverridesProfileMessage,
	missingProfileTokenMessage,
	readEnvToken,
	requireProfile,
} from '../../lib/auth.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { ensureMigrated, ensureSecretsKeyed, getSecret } from '../../lib/credentials.js';
import { updateUserId } from '../../lib/hooks/telemetry/useTelemetryState.js';
import { useSelectFromList } from '../../lib/hooks/user-confirmations/useSelectFromList.js';
import { info, success } from '../../lib/outputs.js';

export class AuthSwitchCommand extends ApifyCommand<typeof AuthSwitchCommand> {
	static override name = 'switch' as const;

	static override description =
		'Sets the stored account that commands use. Without an argument, prompts you to pick one of the stored accounts.';

	static override group = 'Authentication';

	static override interactive = true;

	static override interactiveNote =
		'Prompts for the account when called without an argument. Pass the name or user ID to skip the prompt.';

	static override args = {
		profile: Args.string({
			description: 'The stored account to make active, by name or user ID. See "apify auth list".',
		}),
	};

	static override examples = [
		{
			description: 'Pick the active account from a list.',
			command: 'apify auth switch',
		},
		{
			description: 'Make the "my-org" account active.',
			command: 'apify auth switch my-org',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-auth-switch';

	async run() {
		if (readEnvToken().kind !== 'unset') {
			process.exitCode = CommandExitCodes.InvalidInput;
			throw new Error(envTokenOverridesProfileMessage('the active account'));
		}

		const profile = await requireProfile(this.args.profile ?? (await this.pickProfile()));

		// Local read, so a profile whose secret was removed is refused before it becomes active.
		if (!(await getSecret(profile.id, 'token'))) {
			process.exitCode = CommandExitCodes.MissingAuth;
			throw new Error(missingProfileTokenMessage(profile));
		}

		if (profile.id === getActiveProfileId()) {
			info({ message: `${profileLabel(profile)} is already the active account.` });
			return;
		}

		setActiveProfile(profile.id);
		await updateUserId(profile.id);

		success({ message: `${profileLabel(profile)} is now the active account.` });
	}

	private async pickProfile(): Promise<string> {
		await ensureMigrated();
		await ensureAuthFileCurrent();
		await ensureSecretsKeyed();

		const profiles = listProfiles();
		if (!profiles.length) {
			process.exitCode = CommandExitCodes.MissingAuth;
			throw new Error('No accounts are stored. Run "apify login" to add one.');
		}

		return useSelectFromList({
			message: 'Which account do you want to use?',
			choices: profiles.map((profile) => ({
				name: `${profileLabel(profile)} (${profile.id})`,
				value: profile.id,
			})),
			default: getActiveProfileId(),
			errorMessageForStdin:
				'Pass the account to switch to, for example "apify auth switch <name>". Run "apify auth list" to see the stored accounts.',
		});
	}
}
