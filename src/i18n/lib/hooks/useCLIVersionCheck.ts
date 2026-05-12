import { defineMessages } from '../../../lib/i18n/index.js';

export const useCLIVersionCheckMessages = defineMessages({
	en: {
		failedToFetchLatestVersion: {
			markdown: 'Failed to fetch latest version of Apify CLI, using the cached version instead.',
			json: () => null,
		},
	},
});
