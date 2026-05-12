import { defineMessages } from '../../../lib/i18n/index.js';

export const RunsAbortCommandMessages = defineMessages({
	en: {
		runNotFound: {
			markdown: 'Run with ID "{runId}" was not found on your account.',
			json: () => null,
		},
		alreadyAborting: {
			markdown: 'Run with ID "{runId}" is already aborting.',
			json: () => null,
		},
		alreadyAborted: {
			markdown: 'Run with ID "{runId}" is already aborted.',
			json: () => null,
		},
		triggeredForce: {
			markdown: 'Triggered the immediate abort of run "{runId}".',
			json: () => null,
		},
		triggeredGraceful: {
			markdown: 'Triggered the abort of run "{runId}", it should finish aborting in up to 30 seconds.',
			json: () => null,
		},
		abortFailed: {
			markdown: 'Failed to abort run "{runId}".\n  {message}',
			json: () => null,
		},
	},
});
