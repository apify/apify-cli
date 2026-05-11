import { defineMessages } from '../../../lib/i18n/index.js';

export const KeyValueStoresGetValueCommandMessages = defineMessages({
	en: {
		storeNotFound: {
			markdown: 'Key-value store with ID "{storeId}" not found.',
			json: () => null,
		},
		itemNotFound: {
			markdown: 'Item with key "{itemKey}" not found in the key-value store.',
			json: () => null,
		},
	},
});
