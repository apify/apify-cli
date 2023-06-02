const { checkLatestVersion, SKIP_UPDATE_CHECK } = require('../lib/version_check');

/**
 * This code'll be call before each commmand run
 * @return {Promise<void>}
 */
exports.default = async (params) => {
    // This is not nessesary when you call the `--check-version` as the same command is called there.
    if (['cv', 'check-version'].includes(params.id)) return;

    // If the user has configured the `APIFY_CLI_SKIP_UPDATE_CHECK` env variable then skip the check.
    if (SKIP_UPDATE_CHECK) return;

    // Check package latest version
    await checkLatestVersion();
};
