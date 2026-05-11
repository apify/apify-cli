import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorPushDataCommandMessages = defineMessages({
	en: {
		noItemProvided: {
			markdown: 'No item was provided.',
			json: () => null,
		},
		failedToParseJson: {
			markdown: 'Failed to parse data as JSON string: {message}',
			json: () => null,
		},
	},
});
