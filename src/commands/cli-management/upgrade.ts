import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import chalk from 'chalk';
import { gte } from 'semver';

import { USER_AGENT } from '../../entrypoints/_shared.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { execWithLog } from '../../lib/exec.js';
import { DEVELOPMENT_VERSION_MARKER, type InstallMethod, useCLIMetadata } from '../../lib/hooks/useCLIMetadata.js';
import type { Asset } from '../../lib/hooks/useCLIVersionAssets.js';
import { useCLIVersionAssets } from '../../lib/hooks/useCLIVersionAssets.js';
import { useCLIVersionCheck } from '../../lib/hooks/useCLIVersionCheck.js';
import { error, info, simpleLog, success, warning } from '../../lib/outputs.js';
import { cliDebugPrint } from '../../lib/utils/cliDebugPrint.js';

const UPDATE_COMMANDS: Record<InstallMethod, (version: string, entrypoint: string) => string[]> = {
	bundle: (_, entrypoint) => [`${entrypoint}`, 'upgrade'],
	npm: (version) => ['npm', 'install', '-g', `apify-cli@${version}`],
	pnpm: (version) => ['pnpm', 'install', '-g', `apify-cli@${version}`],
	bun: (version) => ['bun', 'install', '-g', `apify-cli@${version}`],
	homebrew: () => ['brew', 'upgrade', 'apify-cli'],
	volta: (version) => ['volta', 'install', `apify-cli@${version}`],
};

// TODO: update this once we bump the CLI version and release it with this command available
const MINIMUM_VERSION_FOR_UPGRADE_COMMAND = '1.0.1';

/**
 * The link to the upgrade script needed for windows when upgrading CLI bundles (as a fallback for when the script is missing)
 * Unix-based systems do not require a similar script as they allow the executing process to override itself
 * (so we can replace the binary while it is running)
 */
const WINDOWS_UPGRADE_SCRIPT_URL = 'https://raw.githubusercontent.com/apify/apify-cli/main/scripts/install/upgrade.ps1';

export class UpgradeCommand extends ApifyCommand<typeof UpgradeCommand> {
	static override name = 'upgrade' as const;

	static override description = 'Checks that installed Apify CLI version is up to date.';

	static override hidden = true;

	static override aliases = ['cv', 'check-version'];

	static override flags = {
		force: Flags.boolean({
			description:
				'[DEPRECATED] This flag is now ignored, as running the command manually will always check for the latest version.',
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

		const result = await useCLIVersionCheck(!this.flags.internalAutomaticCall);
		const { installMethod } = useCLIMetadata();

		if (!result.shouldUpdate || result.currentVersion === DEVELOPMENT_VERSION_MARKER) {
			cliDebugPrint('[upgrade] no update needed', {
				shouldUpdate: result.shouldUpdate,
				currentVersion: result.currentVersion,
			});

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

			if (metadata.platform === 'windows') {
				return this.startUpgradeProcess(bundleDirectory, versionWithoutV, assets);
			}

			await this.handleUnixUpgrade(bundleDirectory, versionWithoutV, assets);

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
		success({ message: `Successfully upgraded to ${version} 👍` });
	}

	private async startUpgradeProcess(bundleDirectory: string, version: string, assets: Asset[]) {
		// Assert that we have the upgrade script, and download if it is missing
		await this.upsertUpgradeScript(bundleDirectory);

		// Start the child process with it, and exit the cli
		const args = [
			'-ExecutionPolicy',
			'Bypass',
			'-File',
			`"${join(bundleDirectory, 'upgrade.ps1')}"`,
			'-ProcessId',
			process.pid.toString(),
			'-InstallLocation',
			`"${bundleDirectory}"`,
			'-Version',
			`"${version}"`,
		];

		const urls = assets.map((asset) => asset.browser_download_url).join(',');

		args.push('-AllUrls', `"${urls}"`);

		cliDebugPrint('[upgrade] starting upgrade process with args', args);

		info({ message: `Starting upgrade process...` });

		const upgradeProcess = spawn('powershell.exe', args, {
			detached: true,
			shell: true,
			stdio: 'inherit',
			windowsHide: false,
			windowsVerbatimArguments: true,
		});

		upgradeProcess.on('spawn', () => {
			cliDebugPrint('[upgrade] upgrade process spawned');

			upgradeProcess.unref();
			// CLI exits, but the upgrade process continues in the background
			process.exit(0);
		});

		upgradeProcess.on('error', (err) => {
			error({ message: `Failed to start the upgrade process: ${err.message}` });
		});
	}

	private async upsertUpgradeScript(bundleDirectory: string) {
		const filePath = join(bundleDirectory, 'upgrade.ps1');

		if (existsSync(filePath)) {
			return;
		}

		const metadata = useCLIMetadata();

		const res = await fetch(WINDOWS_UPGRADE_SCRIPT_URL, { headers: { 'User-Agent': USER_AGENT } });

		if (!res.ok) {
			error({
				message: [
					`Failed to fetch the upgrade script. Please open an issue on https://github.com/apify/apify-cli/issues/new and provide the following information:`,
					`- The system you are running on: ${metadata.platform} ${metadata.arch}`,
					`- The URL of the asset that failed to fetch: ${WINDOWS_UPGRADE_SCRIPT_URL}`,
					`- The status code of the response: ${res.status}`,
				].join('\n'),
			});

			process.exit(1);
		}

		const buffer = await res.arrayBuffer();

		await writeFile(filePath, Buffer.from(buffer));

		cliDebugPrint('[upgrade] downloaded upgrade script to', filePath);
	}

	private async handleUnixUpgrade(bundleDirectory: string, version: string, assets: Asset[]) {
		const metadata = useCLIMetadata();

		for (const asset of assets) {
			const cliName = asset.name.split('-')[0];
			const filePath = join(bundleDirectory, cliName);

			info({ message: `Downloading ${cliName}...` });

			const res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': USER_AGENT } });

			if (!res.ok) {
				const body = await res.text();

				cliDebugPrint('[upgrade] failed to fetch asset', { asset, status: res.status, body });

				error({
					message: [
						`Failed to fetch the ${cliName} bundle. Please open an issue on https://github.com/apify/apify-cli/issues/new and provide the following information:`,
						`- The version you are trying to upgrade to: ${version}`,
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

			info({ message: chalk.gray(`Writing ${cliName} to ${filePath}...`) });

			const buffer = await res.arrayBuffer();

			try {
				const originalFilePerms = await lstat(filePath)
					.then((stat) => stat.mode)
					// Default to rwx for current user and rx for group and others
					.catch(() => 0o755);

				await writeFile(filePath, Buffer.from(buffer), {
					// Make the file executable again on unix systems, by always making the current user have rwx
					// eslint-disable-next-line no-bitwise -- intentionally using bitwise operators
					mode: originalFilePerms | 0o700,
				});

				cliDebugPrint(`[upgrade ${cliName}] wrote asset to`, filePath);
			} catch (err: any) {
				cliDebugPrint('[upgrade] failed to write asset', { error: err });

				error({
					message: [
						`Failed to write the ${cliName} bundle. Please open an issue on https://github.com/apify/apify-cli/issues/new and provide the following information:`,
						`- The version you are trying to upgrade to: ${version}`,
						`- The system you are running on: ${metadata.platform} ${metadata.arch}`,
						`- The URL of the asset that failed to fetch: ${asset.browser_download_url}`,
						`- The error: ${err.message}`,
					].join('\n'),
				});
			}
		}
	}
}
