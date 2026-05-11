import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorPushDataCommandMessages = defineMessages({
	en: {
		noItemProvided: {
			markdown: 'No item was provided. Provide an object or an array of objects to this command',
			json: () => ({ code: 'NO_ITEM_PROVIDED', hint: 'pass JSON object or array of objects' }),
		},
		failedToParseJson: {
			markdown: 'Failed to parse data as JSON string: {message}',
			json: (message: string) => ({ code: 'FAILED_TO_PARSE_JSON', message }),
		},
	},
});
