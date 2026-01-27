import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { AUTH_FILE_PATH } from '../../lib/consts.js';
import { rimrafPromised } from '../../lib/files.js';
import { updateUserId } from '../../lib/hooks/telemetry/useTelemetryState.js';
import { success } from '../../lib/outputs.js';
import { tildify } from '../../lib/utils.js';

export class AuthLogoutCommand extends ApifyCommand<typeof AuthLogoutCommand> {
	static override name = 'logout' as const;

	static override description =
		`Removes authentication by deleting your API token and account information from '${tildify(AUTH_FILE_PATH())}'.\n` +
		`Run 'apify login' to authenticate again.`;

	async run() {
		await rimrafPromised(AUTH_FILE_PATH());

		await updateUserId(null);

		success({ message: 'You are logged out from your Apify account.' });
	}
}
