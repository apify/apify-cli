import { defineMessages } from '../../../lib/i18n/index.js';

export const RunsLogCommandMessages = defineMessages({
	en: {
		runNotFound: {
			markdown: 'Run with ID "{runId}" was not found on your account.',
			json: () => null,
		},
		logHeader: {
			markdown: 'Log for run with ID "{runId}":\n',
			json: () => null,
		},
		logFetchFailed: {
			markdown: 'Failed to get log for run with ID "{runId}": {message}',
			json: () => null,
		},
	},
});
