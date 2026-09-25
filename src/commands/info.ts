import chalk from 'chalk';

import { resolveAuth, TOKEN_SOURCE_LABELS } from '../lib/auth.js';
import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { getCurrentUserInfo, getLoggedClientOrThrow } from '../lib/utils.js';

export class InfoCommand extends ApifyCommand<typeof InfoCommand> {
	static override name = 'info' as const;

	static override enableProfileFlag = true;

	static override description = 'Prints details about your currently authenticated Apify account.';

	static override group = 'Apify Console';

	static override examples = [
		{
			description: 'Print the currently logged-in account username and user ID.',
			command: 'apify info',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-info';

	async run() {
		await getLoggedClientOrThrow();
		const info = await getCurrentUserInfo();
		const auth = await resolveAuth();

		const rows = {
			'username': info.username,
			'userId': info.id,
			'token source': this.flags.profile ? '--profile flag' : TOKEN_SOURCE_LABELS[auth!.source],
			...(auth!.profile ? { profile: auth!.profile.label } : {}),
		};

		for (const [key, value] of Object.entries(rows)) {
			console.log(`${chalk.gray(key)}: ${chalk.bold(value)}`);
		}
	}
}
