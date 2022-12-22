const chalk = require('chalk');
const {
    spawnSync,
} = require('child_process');
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

/**
 * Fetches the latest NPM version of Apify CLI and caches it locally.
 */
const getAndCacheLatestNpmVersion = () => {
    try {
        info('Making sure that Apify CLI is up to date...');

        const latestNpmVersion = spawnSync('npm', ['view', 'apify-cli', 'version']).stdout.toString().trim();

        extendLocalState({
            latestNpmVersion,
            latestNpmVersionCheckedAt: new Date(),
        });

        return latestNpmVersion;
    } catch (err) {
        warning('Cannot fetch the latest Apify CLI version from NPM!');
    }
};

/**
 * Logs warning if client local package is not in the latest version
 * Check'll be skip if user is offline
 * Check'll run approximately every 10. call
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
        ? getAndCacheLatestNpmVersion()
        : cachedLatestNpmVersion;

    const currentNpmVersion = require('../../package.json').version; //  eslint-disable-line

    if (latestNpmVersion && semver.gt(latestNpmVersion, currentNpmVersion)) {
        console.log('');
        warning('You are using an old version of Apify CLI. We strongly recommend you always use the latest available version.');
        console.log(`       ↪ Run ${chalk.bgWhite(chalk.black(' npm install apify-cli@latest -g '))} to install it! 👍 \n`);
    } else if (shouldGetCurrentVersion) {
        // In this case the version was refreshed from the NPM which took a while and "Info: Making sure that Apify ..." was printed
        // so also print the state.
        info('Apify CLI is up to date 👍 \n');
    }
};

module.exports = {
    checkLatestVersion,
};
