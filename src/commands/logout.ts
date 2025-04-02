import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { AUTH_FILE_PATH } from '../lib/consts.js';
import { rimrafPromised } from '../lib/files.js';
import { success } from '../lib/outputs.js';
import { regenerateLocalDistinctId } from '../lib/telemetry.js';

export class LogoutCommand extends ApifyCommand<typeof LogoutCommand> {
	static override name = 'logout';

	static override description =
		`Removes authentication by deleting your API token and account information from '~/.apify'.\n` +
		`Run 'apify login' to authenticate again.`;

	async run() {
		await rimrafPromised(AUTH_FILE_PATH());
		regenerateLocalDistinctId();
		success({ message: 'You are logged out from your Apify account.' });
	}
}
