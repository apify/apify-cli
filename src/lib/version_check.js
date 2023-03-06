const { execSync } = require('child_process');
const process = require('process');
const axios = require('axios');
const chalk = require('chalk');
const semver = require('semver');
const {
    CHECK_VERSION_EVERY_MILLIS,
} = require('./consts');
const {
    warning,
    info,
} = require('./outputs');
const {
    getLocalState,
    extendLocalState,
} = require('./local_state');

const INSTALLATION_TYPE = {
    HOMEBREW: 'HOMEBREW',
    NPM: 'NPM',
};

const UPDATE_COMMAND = {
    [INSTALLATION_TYPE.HOMEBREW]: 'brew update && brew upgrade apify-cli',
    [INSTALLATION_TYPE.NPM]: 'npm install -g apify-cli@latest',
};

/**
 * Detect through which package manager the Apify CLI was installed.
 * @returns {INSTALLATION_TYPE} The installation type of the CLI.
 */
const detectInstallationType = () => {
    // The path of the alias to the `src/bin/run` file is in process.argv[1]
    const commandPath = process.argv[1];

    if (commandPath) {
        // If the real command path is like `/opt/homebrew/Cellar/apify-cli/...` or `/home/linuxbrew/.linuxbrew/Cellar/apify-cli/...`,
        // then the CLI is installed via Homebrew
        if (process.platform === 'linux' || process.platform === 'darwin') {
            const realCommandPath = execSync(`realpath "${commandPath}"`);
            if (realCommandPath.includes('homebrew/Cellar') || realCommandPath.includes('linuxbrew/Cellar')) {
                return INSTALLATION_TYPE.HOMEBREW;
            }
        }
        // Add more install types here once we have the CLI in other package managers
    }

    // If we didn't detect otherwise, assume the CLI was installed through NPM
    return INSTALLATION_TYPE.NPM;
};

const getLatestNpmVersion = async () => {
    const response = await axios({ url: 'https://registry.npmjs.org/apify-cli/latest' });
    const latestVersion = response.data.version;
    return latestVersion;
};

/**
 * Fetches the latest NPM version of Apify CLI and caches it locally.
 */
const getAndCacheLatestNpmVersion = async () => {
    try {
        info('Making sure that Apify CLI is up to date...');

        const latestNpmVersion = await getLatestNpmVersion();

        extendLocalState({
            latestNpmVersion,
            latestNpmVersionCheckedAt: new Date(),
        });

        return latestNpmVersion;
    } catch (err) {
        console.log(err);
        warning('Cannot fetch the latest Apify CLI version from NPM, using the cached version instead.');
    }
};

/**
 * Logs warning if client local package is not in the latest version
 * Check'll be skip if user is offline
 * Check results will be cached for 24 hours
 * @return {Promise<void>}
 */
const checkLatestVersion = async (enforeUpdate = false) => {
    const {
        latestNpmVersion: cachedLatestNpmVersion,
        latestNpmVersionCheckedAt,
    } = getLocalState();

    const isCheckOutdated = !latestNpmVersionCheckedAt || Date.now() - new Date(latestNpmVersionCheckedAt) > CHECK_VERSION_EVERY_MILLIS;
    const isOnline = await import('is-online');

    // If check is outdated and we are online then update the current NPM version.
    const shouldGetCurrentVersion = enforeUpdate || (isCheckOutdated && await isOnline.default({ timeout: 500 }));
    const latestNpmVersion = shouldGetCurrentVersion
        ? await getAndCacheLatestNpmVersion()
        : cachedLatestNpmVersion;

    const currentNpmVersion = require('../../package.json').version; //  eslint-disable-line

    if (latestNpmVersion && semver.gt(latestNpmVersion, currentNpmVersion)) {
        const installationType = detectInstallationType();
        const updateCommand = `' ${UPDATE_COMMAND[installationType]} '`;
        console.log('');
        warning('You are using an old version of Apify CLI. We strongly recommend you always use the latest available version.');
        console.log(`       ↪ Run ${chalk.bgWhite(chalk.black(updateCommand))} to update! 👍 \n`);
    } else if (shouldGetCurrentVersion) {
        // In this case the version was refreshed from the NPM which took a while and "Info: Making sure that Apify ..." was printed
        // so also print the state.
        info('Apify CLI is up to date 👍 \n');
    }
};

module.exports = {
    checkLatestVersion,
    getLatestNpmVersion,
};
