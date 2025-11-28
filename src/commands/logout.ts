import { clearLocalUserInfo, getAllLocalUserInfos } from '../lib/authFile.js';
import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Flags } from '../lib/command-framework/flags.js';
import { AUTH_FILE_PATH } from '../lib/consts.js';
import { updateUserId } from '../lib/hooks/telemetry/useTelemetryState.js';
import { error, success } from '../lib/outputs.js';
import { tildify } from '../lib/utils.js';

export class LogoutCommand extends ApifyCommand<typeof LogoutCommand> {
	static override name = 'logout' as const;

	static override description =
		`Removes authentication by deleting your API token and account information from '${tildify(AUTH_FILE_PATH())}'.\n` +
		`Run 'apify login' to authenticate again.`;

	static override flags = {
		user: Flags.string({
			char: 'u',
			description: 'Username or ID of the user to log out',
			required: false,
		}),
	};

	async run() {
		let { user } = this.flags;
		if (!user) {
			const allLogins = await getAllLocalUserInfos();
			user = allLogins.defaultUserId ?? undefined;
		}
		const loggedOutInfo = await clearLocalUserInfo(user);
		const remainingLogins = await getAllLocalUserInfos();

		let remainingBackendsInfo = '';
		if (remainingLogins.logins.length > 0) {
			const stringInfos = remainingLogins.logins
				.map(({ baseUrl, username, id }) => `- ${username} (${id})${baseUrl ? ` (backend: ${baseUrl})` : ''}`)
				.join('\n');
			remainingBackendsInfo = ` You are still logged in with the following accounts:\n${stringInfos}`;
		}

		if (!loggedOutInfo) {
			const failedInfo = this.flags.user
				? `No stored login found for username or ID '${this.flags.user}'.`
				: 'You were not logged in.';
			error({ message: `${failedInfo}${remainingBackendsInfo}` });
			return;
		}

		await updateUserId(null);
		success({
			message: `You were logged out from the Apify account ${loggedOutInfo.username} (${loggedOutInfo.id}).${remainingBackendsInfo}`,
		});
	}
}
