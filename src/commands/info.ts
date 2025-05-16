import chalk from 'chalk';

import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { getLocalUserInfo, getLoggedClientOrThrow } from '../lib/utils.js';

export class InfoCommand extends ApifyCommand<typeof InfoCommand> {
	static override name = 'info' as const;

	static override description = 'Prints details about your currently authenticated Apify account.';

	async run() {
		await getLoggedClientOrThrow();
		const info = await getLocalUserInfo();

		if (info) {
			const niceInfo = {
				username: info.username,
				userId: info.id,
			} as const;

			for (const key of Object.keys(niceInfo) as (keyof typeof niceInfo)[]) {
				console.log(`${chalk.gray(key)}: ${chalk.bold(niceInfo[key])}`);
			}
		}
	}
}
