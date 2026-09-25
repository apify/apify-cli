import chalk from 'chalk';

import { APIFY_ENV_VARS } from '@apify/consts';

import {
	ensureAuthFileCurrent,
	getActiveProfileId,
	listProfiles,
	profileLabel,
	readAuthFile,
} from '../../lib/auth-file.js';
import { invalidEnvTokenMessage, NO_STORED_ACCOUNTS_MESSAGE, readEnvToken } from '../../lib/auth.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { ensureMigrated, ensureSecretsKeyed } from '../../lib/credentials.js';
import { simpleLog, warning } from '../../lib/outputs.js';
import { printJsonToStdout, TimestampFormatter } from '../../lib/utils.js';

const table = new ResponsiveTable({
	allColumns: ['Name', 'User ID', 'Type', 'Last login', 'Storage'],
	mandatoryColumns: ['Name', 'User ID'],
});

export class AuthListCommand extends ApifyCommand<typeof AuthListCommand> {
	static override name = 'list' as const;

	static override description =
		'Lists the stored Apify accounts and marks the active one. Reads only the local login, so it works offline and does not check that the tokens are still valid.';

	static override enableJsonFlag = true;

	static override group = 'Authentication';

	static override examples = [
		{
			description: 'List the stored accounts.',
			command: 'apify auth list',
		},
		{
			description: 'List the stored accounts as JSON, for scripts.',
			command: 'apify auth list --json',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-auth-list';

	async run() {
		await ensureMigrated();
		await ensureAuthFileCurrent();
		await ensureSecretsKeyed();

		const file = readAuthFile();
		const activeId = getActiveProfileId();
		const envToken = readEnvToken();

		const profiles = listProfiles().map((profile) => ({
			id: profile.id,
			name: profileLabel(profile),
			username: profile.username ?? null,
			active: profile.id === activeId,
			isOrganization: Boolean(profile.organizationOwnerUserId),
			organizationOwnerUserId: profile.organizationOwnerUserId ?? null,
			loggedInAt: profile.loggedInAt,
			// A file without the marker predates the keyring, so its secrets are still in it.
			secretsBackend: profile.secretsBackend ?? file.secretsBackend ?? 'file',
		}));

		if (this.flags.json) {
			printJsonToStdout({ envTokenInUse: envToken.kind !== 'unset', profiles });
			return;
		}

		if (envToken.kind === 'token') {
			warning({
				message: `${APIFY_ENV_VARS.TOKEN} is set, so commands use it instead of the active account.`,
			});
		} else if (envToken.kind === 'invalid') {
			warning({ message: invalidEnvTokenMessage(envToken.raw) });
		}

		if (!profiles.length) {
			simpleLog({ message: NO_STORED_ACCOUNTS_MESSAGE, stdout: true });
			return;
		}

		for (const profile of profiles) {
			table.pushRow({
				Name: profile.active ? `${chalk.bold(profile.name)} ${chalk.green('(active)')}` : profile.name,
				'User ID': chalk.gray(profile.id),
				Type: profile.isOrganization ? 'Organization' : 'Personal',
				'Last login': profile.loggedInAt
					? TimestampFormatter.display(new Date(profile.loggedInAt))
					: chalk.gray('Unknown'),
				Storage: profile.secretsBackend === 'keyring' ? 'OS keyring' : 'auth.json',
			});
		}

		simpleLog({ message: table.render(CompactMode.WebLikeCompact), stdout: true });
	}
}
