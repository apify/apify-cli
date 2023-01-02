const { checkLatestVersion } = require('../lib/version_check');

/**
 * This code'll be call before each commmand run
 * @return {Promise<void>}
 */
exports.default = async (params) => {
    // This is not nessesary when you call the `--check-version` as the same command is called there.
    if (['cv', 'check-version'].includes(params.id)) return;

    // Check package latest version
    await checkLatestVersion();
};
