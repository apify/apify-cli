import { defineMessages } from '../../../lib/i18n/index.js';

export const RunsResurrectCommandMessages = defineMessages({
	en: {
		runNotFound: {
			markdown: 'Run with ID "{runId}" was not found on your account.',
			json: () => null,
		},
		cannotResurrect: {
			markdown:
				'Run with ID "{runId}" cannot be resurrected, as it is still running or in the process of aborting.',
			json: () => null,
		},
		resurrected: {
			markdown: 'Run with ID "{runId}" was resurrected successfully.',
			json: () => null,
		},
		resurrectFailed: {
			markdown: 'Failed to resurrect run "{runId}".\n  {message}',
			json: () => null,
		},
	},
});
