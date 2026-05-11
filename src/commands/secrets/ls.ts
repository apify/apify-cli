import { SecretsLsCommandMessages } from '#i18n/commands/secrets/ls.js';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { getSecretsFile } from '../../lib/secrets.js';

const table = new ResponsiveTable({
	allColumns: ['Secret Name'],
	mandatoryColumns: ['Secret Name'],
	columnAlignments: {
		'Secret Name': 'left',
	},
});

export class SecretsLsCommand extends ApifyCommand<typeof SecretsLsCommand> {
	static override name = 'ls' as const;

	static override description = 'Lists all secret keys stored in your local configuration.';

	static override examples = [
		{
			description: 'List the names of all locally stored secrets.',
			command: 'apify secrets ls',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-secrets-ls';

	async run() {
		const { json } = this.flags;

		const secrets = getSecretsFile();
		const secretKeys = Object.keys(secrets);

		if (json) {
			this.logger.stdout.json({ keys: secretKeys });
			return;
		}

		if (secretKeys.length === 0) {
			this.logger.stdout.info(this.t(SecretsLsCommandMessages.noSecrets));

			return;
		}

		for (const key of secretKeys) {
			table.pushRow({
				'Secret Name': chalk.cyan(key),
			});
		}

		this.logger.stdout.log(table.render(CompactMode.WebLikeCompact));
	}
}
