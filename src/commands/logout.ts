import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { AUTH_FILE_PATH } from '../lib/consts.js';
import { updateUserId } from '../lib/hooks/telemetry/useTelemetryState.js';
import { error, success } from '../lib/outputs.js';
import { clearLocalUserInfo, listLocalUserInfos, tildify } from '../lib/utils.js';

export class LogoutCommand extends ApifyCommand<typeof LogoutCommand> {
	static override name = 'logout' as const;

	static override description =
		`Removes authentication by deleting your API token and account information from '${tildify(AUTH_FILE_PATH())}'.\n` +
		`Run 'apify login' to authenticate again.`;

	async run() {
		const wasLoggedOut = await clearLocalUserInfo();
		const remainingLogins = await listLocalUserInfos();

		let remainingBackendsInfo = '';
		if (remainingLogins.length > 0) {
			// this message is probably never seen by public users, just Apify devs
			const stringInfos = remainingLogins
				.map(({ baseUrl, username }) => `- ${baseUrl} (user: ${username})`)
				.join('\n');
			remainingBackendsInfo = ` You are still logged in to the following Apify authentication backends:\n${stringInfos}`;
		}

		if (!wasLoggedOut) {
			error({ message: `You were not logged in.${remainingBackendsInfo}` });
			return;
		}

		await updateUserId(null);
		success({ message: `You are logged out from the current Apify account.${remainingBackendsInfo}` });
	}
}
