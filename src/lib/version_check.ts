import { realpathSync } from 'node:fs';

import axios from 'axios';
import chalk from 'chalk';
import { gt } from 'semver';

import { CHECK_VERSION_EVERY_MILLIS, CURRENT_APIFY_CLI_VERSION } from './consts.js';
import { extendLocalState, getLocalState } from './local_state.js';
import { info, simpleLog, warning } from './outputs.js';

const INSTALLATION_TYPE = {
	HOMEBREW: 'HOMEBREW',
	NPM: 'NPM',
	VOLTA: 'VOLTA',
} as const;

const UPDATE_COMMAND = {
	[INSTALLATION_TYPE.HOMEBREW]: 'brew update && brew upgrade apify-cli',
	[INSTALLATION_TYPE.NPM]: 'npm install -g apify-cli@latest',
	[INSTALLATION_TYPE.VOLTA]: 'volta install apify-cli@latest',
} as const;

export const SKIP_UPDATE_CHECK =
	process.env.APIFY_CLI_SKIP_UPDATE_CHECK &&
	!['0', 'false'].includes(process.env.APIFY_CLI_SKIP_UPDATE_CHECK.toLowerCase());

/**
 * Detect through which package manager the Apify CLI was installed.
 * The installation type of the CLI.
 */
export const detectInstallationType = () => {
	// The path of the alias to the `src/bin/run` file is in process.argv[1]
	const commandPath = process.argv[1];

	// volta installed CLI
	if (process.env.VOLTA_HOME && commandPath.toLowerCase().includes(process.env.VOLTA_HOME.toLowerCase())) {
		return INSTALLATION_TYPE.VOLTA;
	}

	if (commandPath) {
		// If the real command path is like `/opt/homebrew/Cellar/apify-cli/...` or `/home/linuxbrew/.linuxbrew/Cellar/apify-cli/...`,
		// then the CLI is installed via Homebrew
		if (process.platform === 'linux' || process.platform === 'darwin') {
			const realCommandPath = realpathSync(commandPath);
			if (realCommandPath.includes('homebrew/Cellar') || realCommandPath.includes('linuxbrew/Cellar')) {
				return INSTALLATION_TYPE.HOMEBREW;
			}
		}
		// Add more install types here once we have the CLI in other package managers
	}

	// If we didn't detect otherwise, assume the CLI was installed through NPM
	return INSTALLATION_TYPE.NPM;
};

export const getLatestNpmVersion = async () => {
	const response = await axios({ url: 'https://registry.npmjs.org/apify-cli/latest' });
	const latestVersion = response.data.version;
	return latestVersion as string;
};

/**
 * Fetches the latest NPM version of Apify CLI and caches it locally.
 */
const getAndCacheLatestNpmVersion = async (): Promise<string | undefined> => {
	try {
		info({ message: 'Making sure that Apify CLI is up to date...' });

		const latestNpmVersion = await getLatestNpmVersion();

		extendLocalState({
			latestNpmVersion,
			latestNpmVersionCheckedAt: new Date(),
		});

		return latestNpmVersion;
	} catch (err) {
		console.error(err);
		warning({ message: 'Cannot fetch the latest Apify CLI version from NPM, using the cached version instead.' });

		return undefined;
	}
};

/**
 * Logs warning if client local package is not in the latest version
 * Check'll be skip if user is offline
 * Check results will be cached for 24 hours
 */
export const checkLatestVersion = async (enforceUpdate = false) => {
	const { latestNpmVersion: cachedLatestNpmVersion, latestNpmVersionCheckedAt } = getLocalState();

	const isCheckOutdated =
		!latestNpmVersionCheckedAt ||
		Date.now() - new Date(latestNpmVersionCheckedAt as string).getTime() > CHECK_VERSION_EVERY_MILLIS;

	const isOnline = await import('is-online');

	// If check is outdated and we are online then update the current NPM version.
	const shouldGetCurrentVersion = enforceUpdate || (isCheckOutdated && (await isOnline.default({ timeout: 500 })));
	const latestNpmVersion = shouldGetCurrentVersion
		? await getAndCacheLatestNpmVersion()
		: (cachedLatestNpmVersion as string);

	if (latestNpmVersion && gt(latestNpmVersion as string, CURRENT_APIFY_CLI_VERSION)) {
		const installationType = detectInstallationType();
		const updateCommand = `' ${UPDATE_COMMAND[installationType]} '`;
		simpleLog({ message: '' });
		warning({
			message:
				'You are using an old version of Apify CLI. We strongly recommend you always use the latest available version.',
		});
		simpleLog({ message: `       ↪ Run ${chalk.bgWhite(chalk.black(updateCommand))} to update! 👍 \n` });
	} else if (shouldGetCurrentVersion) {
		// In this case the version was refreshed from the NPM which took a while and "Info: Making sure that Apify ..." was printed
		// so also print the state.
		info({ message: 'Apify CLI is up to date 👍 \n' });
	}
};
