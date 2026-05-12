import { defineMessages } from '../../../lib/i18n/index.js';

export const KeyValueStoresSetValueCommandMessages = defineMessages({
	en: {
		storeNotFound: {
			markdown: 'Key-value store with ID or name "{storeId}" not found.',
			json: () => null,
		},
		valueSet: {
			markdown: 'Value with key "{itemKey}" set in the key-value store.',
			json: () => null,
		},
		setFailed: {
			markdown: 'Failed to set value with key "{itemKey}" in the key-value store.\n  {message}',
			json: () => null,
		},
	},
});
