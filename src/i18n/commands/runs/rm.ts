import { defineMessages } from '../../../lib/i18n/index.js';

export const RunsRmCommandMessages = defineMessages({
	en: {
		runNotFound: {
			markdown: 'Run with ID "{runId}" was not found on your account.',
			json: () => null,
		},
		cannotDelete: {
			markdown: 'Run with ID "{runId}" cannot be deleted, as it is still running or in the process of aborting.',
			json: () => null,
		},
		deletionCanceled: {
			markdown: 'Deletion of run "{runId}" was canceled.',
			json: () => null,
		},
		deleted: {
			markdown: 'Run with ID "{runId}" was deleted.',
			json: () => null,
		},
		deleteFailed: {
			markdown: 'Failed to delete run "{runId}".\n  {message}',
			json: () => null,
		},
	},
});
