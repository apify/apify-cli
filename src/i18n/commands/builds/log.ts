import { defineMessages } from '../../../lib/i18n/index.js';

export const BuildsLogCommandMessages = defineMessages({
	en: {
		buildNotFound: {
			markdown: 'Build with ID "{buildId}" was not found on your account.',
			json: () => null,
		},
		logHeader: {
			markdown: 'Log for build with ID "{buildId}":\n',
			json: () => null,
		},
		logFailed: {
			markdown: 'Failed to get log for build with ID "{buildId}": {message}',
			json: () => null,
		},
	},
});
