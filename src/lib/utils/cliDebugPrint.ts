import chalk from 'chalk';

export function cliDebugPrint(tag: string, ...args: unknown[]) {
	if (process.env.APIFY_CLI_DEBUG) {
		console.error(chalk.gray(`[${tag}]`), ...args);
	}
}
