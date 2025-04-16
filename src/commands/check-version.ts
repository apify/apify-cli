import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Flags } from '../lib/command-framework/flags.js';
import { checkLatestVersion } from '../lib/version_check.js';

export class CheckVersionCommand extends ApifyCommand<typeof CheckVersionCommand> {
	static override name = 'check-version' as const;

	static override description = 'Checks that installed Apify CLI version is up to date.';

	static override flags = {
		'enforce-update': Flags.boolean({
			char: 'e',
			description: '[Optional] Enforce version update from NPM',
			required: false,
		}),
	};

	static override hidden = true;

	static override aliases = ['cv'];

	async run() {
		await checkLatestVersion(this.flags.enforceUpdate);
	}
}
