import chalk from 'chalk';
import { gte } from 'semver';

import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Flags } from '../lib/command-framework/flags.js';
import { DEVELOPMENT_VERSION_MARKER, type InstallMethod, useCLIMetadata } from '../lib/hooks/useCLIMetadata.js';
import { useCLIVersionCheck } from '../lib/hooks/useCLIVersionCheck.js';
import { error, info, simpleLog, warning } from '../lib/outputs.js';

const UPDATE_COMMANDS: Record<Exclude<InstallMethod, 'bundle'>, (version: string) => string> = {
	npm: (version) => `npm install -g apify-cli@${version}`,
	// TODO: homebrew will move to bundles instead of node+npm, this might break resolving the version, tbd
	homebrew: () => `brew upgrade apify-cli`,
	volta: (version) => `volta install apify-cli@${version}`,
};

const MINIMUM_VERSION_FOR_UPGRADE_COMMAND = '0.28.0';

export class UpgradeCommand extends ApifyCommand<typeof UpgradeCommand> {
	static override name = 'upgrade' as const;

	static override description = 'Checks that installed Apify CLI version is up to date.';

	static override hidden = true;

	static override aliases = ['cv', 'check-version'];

	static override flags = {
		force: Flags.boolean({
			description:
				'Whether to skip checking the locally cached latest version of the CLI and fetch it from the internet instead.',
			required: false,
			char: 'f',
		}),
		yes: Flags.boolean({
			description: 'Whether to automatically run the command required to update the CLI.',
			required: false,
			char: 'y',
		}),
		version: Flags.string({
			description: 'The version of the CLI to upgrade to. If not provided, the latest version will be used.',
			required: false,
		}),
	};

	async run() {
		if (this.flags.version) {
			await this.handleInstallSpecificVersion(this.flags.version);
			return;
		}

		const result = await useCLIVersionCheck(this.flags.force);
		const { installMethod } = useCLIMetadata();

		if (!result.shouldUpdate || result.currentVersion === DEVELOPMENT_VERSION_MARKER) {
			if (!result.cacheHit) {
				info({ message: 'Apify CLI is up to date 👍 \n' });
			}

			return;
		}

		if (installMethod === 'bundle') {
			await this.handleBundleUpgrade();
			return;
		}

		const updateCommand = UPDATE_COMMANDS[installMethod](this.flags.version ?? 'latest');

		simpleLog({ message: '' });

		const message = [
			'You are using an old version of Apify CLI. We strongly recommend you always use the latest available version.',
			`       ↪ Run ${chalk.bgWhite(chalk.black(updateCommand))} to update! 👍 \n`,
		].join('\n');

		warning({ message });

		// TODO: prompt for confirmation and auto-run command if --yes is passed / confirmed by the user
	}

	async handleInstallSpecificVersion(version: string) {
		// Technically, we could allow downgrades to older versions, but then users would lose the upgrade command 🤷
		if (!gte(version, MINIMUM_VERSION_FOR_UPGRADE_COMMAND)) {
			error({ message: 'The minimum version of the CLI you can manually downgrade/upgrade to is 0.28.0.' });

			return;
		}

		throw new Error('Not implemented');
	}

	async handleBundleUpgrade() {
		throw new Error('Bundles do not support automatic upgrades yet.');
	}
}
