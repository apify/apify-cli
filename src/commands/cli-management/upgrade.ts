import chalk from 'chalk';
import { gte } from 'semver';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { execWithLog } from '../../lib/exec.js';
import { DEVELOPMENT_VERSION_MARKER, type InstallMethod, useCLIMetadata } from '../../lib/hooks/useCLIMetadata.js';
import { useCLIVersionCheck } from '../../lib/hooks/useCLIVersionCheck.js';
import { error, info, simpleLog, warning } from '../../lib/outputs.js';

const UPDATE_COMMANDS: Record<InstallMethod, (version: string, entrypoint: string) => string[]> = {
	bundle: (_, entrypoint) => [`${entrypoint}`, 'upgrade'],
	npm: (version) => ['npm', 'install', '-g', `apify-cli@${version}`],
	pnpm: (version) => ['pnpm', 'install', '-g', `apify-cli@${version}`],
	homebrew: () => ['brew', 'upgrade', 'apify-cli'],
	volta: (version) => ['volta', 'install', `apify-cli@${version}`],
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
		version: Flags.string({
			description: 'The version of the CLI to upgrade to. If not provided, the latest version will be used.',
			required: false,
		}),
		'internal-automatic-call': Flags.boolean({
			description: 'Whether the command was called automatically by the CLI for a version check.',
			hidden: true,
			default: false,
		}),
	};

	private get cliName() {
		return this.entrypoint === 'apify' ? 'Apify CLI' : 'Actor CLI';
	}

	async run() {
		if (this.flags.version) {
			await this.handleInstallSpecificVersion(this.flags.version);
			return;
		}

		const result = await useCLIVersionCheck(this.flags.force);
		const { installMethod } = useCLIMetadata();

		if (!result.shouldUpdate || result.currentVersion === DEVELOPMENT_VERSION_MARKER) {
			if (!result.cacheHit && !this.flags.internalAutomaticCall) {
				info({ message: `${this.cliName} is up to date 👍 \n` });
			}

			return;
		}

		// If the flag is not set, a user manually called the command, so we should upgrade the CLI
		if (!this.flags.internalAutomaticCall) {
			await this.handleModuleUpgrade();
			return;
		}

		const updateCommand = UPDATE_COMMANDS[installMethod]('latest', this.entrypoint).join(' ');

		simpleLog({ message: '' });

		const message = [
			`You are using an old version of ${this.cliName}. We strongly recommend you always use the latest available version.`,
			`       ↪ Run ${chalk.bgWhite(chalk.black(updateCommand))} to update! 👍 \n`,
		].join('\n');

		warning({ message });
	}

	async handleInstallSpecificVersion(version: string) {
		// Technically, we could allow downgrades to older versions, but then users would lose the upgrade command 🤷
		if (!gte(version, MINIMUM_VERSION_FOR_UPGRADE_COMMAND)) {
			error({ message: 'The minimum version of the CLI you can manually downgrade/upgrade to is 0.28.0.' });

			return;
		}

		throw new Error('Not implemented');
	}

	async handleModuleUpgrade() {
		const { installMethod } = useCLIMetadata();

		if (installMethod === 'bundle') {
			throw new Error('Bundles do not support automatic upgrades yet.');
		}

		const updateCommand = UPDATE_COMMANDS[installMethod]('latest', this.entrypoint);

		if (process.env.APIFY_CLI_DEBUG) {
			info({ message: `Would run command: ${updateCommand.join(' ')}` });
			return;
		}

		try {
			await execWithLog({ cmd: updateCommand[0], args: updateCommand.slice(1) });
		} catch {
			error({
				message: `Failed to upgrade the CLI Automatically. Please run the following command manually: ${updateCommand.join(' ')}`,
			});
		}
	}
}
