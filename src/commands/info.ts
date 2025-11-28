import chalk from 'chalk';

import { getAllLocalUserInfos } from '../lib/authFile.js';
import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { error } from '../lib/outputs.js';

export class InfoCommand extends ApifyCommand<typeof InfoCommand> {
	static override name = 'info' as const;

	static override description = 'Prints details about your currently authenticated Apify account.';

	static override requiresAuthentication = 'always' as const;

	async run() {
		const info = await this.apifyClient.user('me').get();

		if (!info) {
			error({ message: 'Failed to retrieve account info.' });
			return;
		}

		console.log(chalk.bold('Current (default) account info:'));
		printAccountInfo({ username: info.username, id: info.id!, baseUrl: this.apifyClient.baseUrl });

		const allInfos = (await getAllLocalUserInfos()).logins.filter((x) => x.id !== info.id);
		if (allInfos.length === 0) return;

		console.log();
		console.log(chalk.bold('Other stored accounts:'));
		let first = true;
		for (const account of allInfos) {
			if (!first) console.log();
			printAccountInfo(account);
			first = false;
		}
	}
}

function printAccountInfo({ username, id, baseUrl }: { username: string; id: string; baseUrl?: string }) {
	console.log(`${chalk.gray('username')}: ${chalk.bold(username)}`);
	console.log(`${chalk.gray('userId')}: ${chalk.bold(id)}`);
	if (baseUrl && !baseUrl.startsWith('https://api.apify.com')) {
		console.log(`${chalk.gray('baseUrl')}: ${chalk.bold(baseUrl)}`);
	}
}
