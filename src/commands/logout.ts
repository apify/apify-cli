import { ApifyCommand } from '../lib/apify_command.js';
import { AUTH_FILE_PATH } from '../lib/consts.js';
import { rimrafPromised } from '../lib/files.js';
import { success } from '../lib/outputs.js';
import { regenerateLocalDistinctId } from '../lib/telemetry.js';

export class LogoutCommand extends ApifyCommand<typeof LogoutCommand> {
	static override description =
		'Logs out of your Apify account.\nThe command deletes the API token and all other ' +
		'account information stored in the ~/.apify directory. To log in again, call "apify login".';

	async run() {
		await rimrafPromised(AUTH_FILE_PATH());
		regenerateLocalDistinctId();
		success({ message: 'You are logged out from your Apify account.' });
	}
}
