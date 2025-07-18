import { chmod, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import chalk from 'chalk';
import { gte } from 'semver';

import { USER_AGENT } from '../../entrypoints/_shared.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { execWithLog } from '../../lib/exec.js';
import { DEVELOPMENT_VERSION_MARKER, type InstallMethod, useCLIMetadata } from '../../lib/hooks/useCLIMetadata.js';
import { useCLIVersionAssets } from '../../lib/hooks/useCLIVersionAssets.js';
import { useCLIVersionCheck } from '../../lib/hooks/useCLIVersionCheck.js';
import { error, info, simpleLog, success, warning } from '../../lib/outputs.js';
import { cliDebugPrint } from '../../lib/utils/cliDebugPrint.js';

const UPDATE_COMMANDS: Record<InstallMethod, (version: string, entrypoint: string) => string[]> = {
	bundle: (_, entrypoint) => [`${entrypoint}`, 'upgrade'],
	npm: (version) => ['npm', 'install', '-g', `apify-cli@${version}`],
	pnpm: (version) => ['pnpm', 'install', '-g', `apify-cli@${version}`],
	homebrew: () => ['brew', 'upgrade', 'apify-cli'],
	volta: (version) => ['volta', 'install', `apify-cli@${version}`],
};

// TODO: update this once we bump the CLI version and release it with this command available
const MINIMUM_VERSION_FOR_UPGRADE_COMMAND = '0.21.8';

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
			// Always print, unless the command was called automatically by the CLI for a version check
			if (!this.flags.internalAutomaticCall) {
				info({ message: `${this.cliName} is up to date 👍 \n` });
			}

			return;
		}

		// If the flag is not set, a user manually called the command, so we should upgrade the CLI
		if (!this.flags.internalAutomaticCall) {
			await this.handleInstallSpecificVersion('latest');
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
		if (version !== 'latest' && !gte(version, MINIMUM_VERSION_FOR_UPGRADE_COMMAND)) {
			error({
				message: `The minimum version of the CLI you can manually downgrade/upgrade to is ${MINIMUM_VERSION_FOR_UPGRADE_COMMAND}.`,
			});

			return;
		}

		const versionData = await useCLIVersionAssets(version);

		if (!versionData) {
			error({ message: `The provided version does not exist. Please check the version number and try again.` });
			return;
		}

		const { assets, version: versionWithoutV } = versionData;

		// Check again, in case `latest` returns an older version for whatever reason
		if (!gte(versionWithoutV, MINIMUM_VERSION_FOR_UPGRADE_COMMAND)) {
			error({
				message: `The minimum version of the CLI you can manually downgrade/upgrade to is ${MINIMUM_VERSION_FOR_UPGRADE_COMMAND}.`,
			});
			return;
		}

		const metadata = useCLIMetadata();

		if (metadata.installMethod === 'bundle') {
			if (!assets.length) {
				error({
					message: [
						'Failed to find the assets for your system and the provided version. Please open an issue on https://github.com/apify/apify-cli/issues/new and provide the following information:',
						`- The version you are trying to upgrade to: ${versionWithoutV}`,
						`- The system you are running on: ${metadata.platform} ${metadata.arch}`,
					].join('\n'),
				});
				return;
			}

			const bundleDirectory = dirname(process.execPath);

			cliDebugPrint('[upgrade] bundleDirectory', bundleDirectory);

			const directoryEntries = await readdir(bundleDirectory);

			if (!directoryEntries.some((entry) => entry.startsWith('apify') || entry.startsWith('actor'))) {
				cliDebugPrint('[upgrade] directoryEntries', directoryEntries);

				error({
					message: [
						`Failed to find the currently installed ${this.cliName} bundle. Please open an issue on https://github.com/apify/apify-cli/issues/new and provide the following information:`,
						`- The version you are trying to upgrade to: ${versionWithoutV}`,
						`- The system you are running on: ${metadata.platform} ${metadata.arch}`,
						`- The directory where the ${this.cliName} bundle is installed: ${bundleDirectory}`,
					].join('\n'),
				});
				return;
			}

			for (const asset of assets) {
				const cliName = asset.name.split('-')[0];
				const fileName = metadata.platform === 'windows' ? `${cliName}.exe` : cliName;
				const filePath = join(bundleDirectory, fileName);

				const res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': USER_AGENT } });

				if (!res.ok) {
					const body = await res.text();

					cliDebugPrint('[upgrade] failed to fetch asset', { asset, status: res.status, body });

					error({
						message: [
							`Failed to fetch the ${cliName} bundle. Please open an issue on https://github.com/apify/apify-cli/issues/new and provide the following information:`,
							`- The version you are trying to upgrade to: ${versionWithoutV}`,
							`- The system you are running on: ${metadata.platform} ${metadata.arch}`,
							`- The URL of the asset that failed to fetch: ${asset.browser_download_url}`,
							`- The status code of the response: ${res.status}`,
							`- The body of the response: ${body}`,
						].join('\n'),
					});

					return;
				}

				if (process.env.APIFY_CLI_DEBUG && !process.env.APIFY_CLI_FORCE) {
					info({ message: `Would write asset ${cliName} to ${filePath}` });

					continue;
				}

				const buffer = await res.arrayBuffer();

				await writeFile(filePath, Buffer.from(buffer));

				// Make the file executable again on unix systems
				await chmod(filePath, 0o755);

				cliDebugPrint(`[upgrade ${cliName}] wrote asset to`, filePath);
			}

			this.successMessage(versionWithoutV);

			return;
		}

		const updateCommand = UPDATE_COMMANDS[metadata.installMethod](version, this.entrypoint);

		if (process.env.APIFY_CLI_DEBUG) {
			info({ message: `Would run command: ${updateCommand.join(' ')}` });
			return;
		}

		try {
			await execWithLog({ cmd: updateCommand[0], args: updateCommand.slice(1) });

			this.successMessage(versionWithoutV);
		} catch {
			error({
				message: `Failed to upgrade the CLI. Please run the following command manually: ${updateCommand.join(' ')}`,
			});
		}
	}

	private successMessage(version: string) {
		success({ message: `Successfully upgraded ${this.cliName} to ${version} 👍` });
	}
}
