import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { AUTH_FILE_PATH } from '../lib/consts.js';
import { rimrafPromised } from '../lib/files.js';
import { success } from '../lib/outputs.js';
import { regenerateLocalDistinctId } from '../lib/telemetry.js';
import { getAuthJsonLocation } from '../lib/utils.js';

export class LogoutCommand extends ApifyCommand<typeof LogoutCommand> {
	static override name = 'logout' as const;

	static override description =
		`Removes authentication by deleting your API token and account information from '${getAuthJsonLocation()}'.\n` +
		`Run 'apify login' to authenticate again.`;

	async run() {
		await rimrafPromised(AUTH_FILE_PATH());
		regenerateLocalDistinctId();
		success({ message: 'You are logged out from your Apify account.' });
	}
}
