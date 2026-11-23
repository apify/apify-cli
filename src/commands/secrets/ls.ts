import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { warnDeprecated } from '../../lib/env-vars/deprecations.js';
import { info, simpleLog } from '../../lib/outputs.js';
import { getSecretsFile } from '../../lib/secrets.js';
import { printJsonToStdout } from '../../lib/utils.js';

const table = new ResponsiveTable({
	allColumns: ['Secret Name'],
	mandatoryColumns: ['Secret Name'],
	columnAlignments: {
		'Secret Name': 'left',
	},
});

export class SecretsLsCommand extends ApifyCommand<typeof SecretsLsCommand> {
	static override name = 'ls' as const;

	static override description =
		'Deprecated: use .env and apify env instead. Lists all secret keys stored in your local configuration.';

	static override examples = [
		{
			description: 'List the names of all locally stored secrets.',
			command: 'apify secrets ls',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-secrets-ls';

	static override enableJsonFlag = true;

	async run() {
		warnDeprecated('secretsCommand', this.telemetryData);

		const { json } = this.flags;

		const secrets = getSecretsFile();
		const secretKeys = Object.keys(secrets);

		if (json) {
			printJsonToStdout({ keys: secretKeys });
			return;
		}

		if (secretKeys.length === 0) {
			info({
				message: "You don't have any secrets stored locally. Use 'apify secrets add' to add a secret.",
				stdout: true,
			});

			return;
		}

		for (const key of secretKeys) {
			table.pushRow({
				'Secret Name': chalk.cyan(key),
			});
		}

		simpleLog({
			message: table.render(CompactMode.WebLikeCompact),
			stdout: true,
		});
	}
}
