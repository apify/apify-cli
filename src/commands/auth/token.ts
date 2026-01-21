import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { getLocalUserInfo, getLoggedClientOrThrow } from '../../lib/utils.js';

export class AuthTokenCommand extends ApifyCommand<typeof AuthTokenCommand> {
	static override name = 'token' as const;

	static override description = 'Prints the current API token for the Apify CLI.';

	async run() {
		await getLoggedClientOrThrow();
		const userInfo = await getLocalUserInfo();

		if (userInfo.token) {
			console.log(userInfo.token);
		}
	}
}
