import { defineMessages } from '../../../lib/i18n/index.js';

export const RunsLsCommandMessages = defineMessages({
	en: {
		invalidActor: {
			markdown: '{reason}. Please run this command in an Actor directory, or specify the Actor ID.',
			json: () => null,
		},
		noRuns: {
			markdown: 'There are no recent runs found for this Actor.',
			json: () => null,
		},
	},
});
