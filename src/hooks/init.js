const { checkLatestVersion } = require('../lib/utils');

/**
 * This code'll be call before each commmand run
 * @return {Promise<void>}
 */
exports.default = async () => {
    // Check package latest version
    await checkLatestVersion();
};
