import { defineMessages } from '../../../lib/i18n/index.js';

export const DatasetsInfoCommandMessages = defineMessages({
	en: {
		storeNotFound: {
			markdown: 'Key-value store with ID or name "{storeId}" not found.',
			json: () => null,
		},
		message: {
			markdown: '{message}',
			json: () => null,
		},
	},
});
