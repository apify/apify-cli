import { Hook } from '@oclif/core';

import { SKIP_UPDATE_CHECK, checkLatestVersion } from '../lib/version_check.js';

/**
 * This code'll be call before each commmand run
 */
const hook: Hook<'init'> = async (params) => {
	// This is not necessary when you call the `--check-version` as the same command is called there.
	if (['cv', 'check-version'].includes(params.id!)) {
		return;
	}

	// If the user has configured the `APIFY_CLI_SKIP_UPDATE_CHECK` env variable then skip the check.
	if (SKIP_UPDATE_CHECK) return;

	// Check package latest version
	await checkLatestVersion();
};

export default hook;
