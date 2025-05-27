import chalk from 'chalk';

import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Flags } from '../lib/command-framework/flags.js';
import { DEVELOPMENT_VERSION_MARKER, type InstallMethod, useCLIMetadata } from '../lib/hooks/useCLIMetadata.js';
import { useCLIVersionCheck } from '../lib/hooks/useCLIVersionCheck.js';
import { info, simpleLog, warning } from '../lib/outputs.js';

const unixCommand = 'curl -fsSL https://apify.com/install-cli.sh | sh';
const windowsCommand = 'powershell -Command "irm https://apify.com/install-cli.ps1 | iex"';

const UPDATE_COMMANDS: Record<Exclude<InstallMethod, 'bundle'>, string> & {
	bundle: Partial<Record<typeof process.platform, string>>;
} = {
	npm: 'npm install -g apify-cli@latest',
	// TODO: homebrew will move to bundles instead of node+npm, this might break resolving the version, tbd
	homebrew: 'brew upgrade apify-cli',
	volta: 'volta install apify-cli@latest',
	bundle: {
		darwin: unixCommand,
		freebsd: unixCommand,
		linux: unixCommand,
		win32: windowsCommand,
	},
};

export class UpgradeCommand extends ApifyCommand<typeof UpgradeCommand> {
	static override name = 'upgrade' as const;

	static override description = 'Checks that installed Apify CLI version is up to date.';

	static override hidden = true;

	static override aliases = ['cv', 'check-version'];

	static override flags = {
		force: Flags.boolean({
			description: 'Force a check for the latest version of the CLI.',
			required: false,
			char: 'f',
		}),
	};

	async run() {
		const result = await useCLIVersionCheck(this.flags.force);
		const { installMethod } = useCLIMetadata();

		if (!result.shouldUpdate) {
			info({ message: 'Apify CLI is up to date 👍 \n' });
			return;
		}

		// Only for dev users
		if (result.currentVersion === DEVELOPMENT_VERSION_MARKER) {
			warning({ message: 'Version checker is running on a development version of the CLI.' });
		}

		let updateCommand = UPDATE_COMMANDS[installMethod];

		// TODO: bundle should ideally self-upgrade, and not require a command run
		if (installMethod === 'bundle') {
			updateCommand = UPDATE_COMMANDS.bundle[process.platform] || unixCommand;
		}

		simpleLog({ message: '' });

		const message = [
			'You are using an old version of Apify CLI. We strongly recommend you always use the latest available version.',
			`       ↪ Run ${chalk.bgWhite(chalk.black(updateCommand))} to update! 👍 \n`,
		].join('\n');

		warning({ message });
	}
}
