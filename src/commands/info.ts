import chalk from 'chalk';

import { resolveAuth, TOKEN_SOURCE_LABELS } from '../lib/auth.js';
import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { info } from '../lib/outputs.js';
import { getCurrentUserInfo, getLoggedClientOrThrow, AccountDetailsForbiddenError } from '../lib/utils.js';

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
		const auth = await resolveAuth();
		const tokenSource = { 'token source': TOKEN_SOURCE_LABELS[auth!.source] };

		let rows: Record<string, string | undefined>;
		try {
			const user = await getCurrentUserInfo();
			rows = { 'username': user.username, 'userId': user.id, ...tokenSource };
		} catch (err) {
			if (!(err instanceof AccountDetailsForbiddenError)) throw err;
			info({
				message:
					"Your API token can't read your account details (it probably has limited permissions), so only the token source is shown.",
			});
			rows = tokenSource;
		}

		for (const [key, value] of Object.entries(rows)) {
			console.log(`${chalk.gray(key)}: ${chalk.bold(value)}`);
		}
	}
}
