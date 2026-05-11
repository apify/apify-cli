import { defineMessages } from '../../../lib/i18n/index.js';

export const KeyValueStoresDeleteValueCommandMessages = defineMessages({
	en: {
		storeNotFound: {
			markdown: 'Key-value store with ID or name "{storeId}" not found.',
			json: () => null,
		},
		itemNotFound: {
			markdown: 'Item with key "{itemKey}" not found in the key-value store.',
			json: () => null,
		},
		deletionAborted: {
			markdown: 'Key-value store record deletion aborted.',
			json: () => null,
		},
		deleted: {
			markdown: (md, colors) =>
				md(`Record with key "${colors.yellow('{itemKey}')}" deleted from the key-value store.`),
			json: () => null,
		},
		deleteFailed: {
			markdown: 'Failed to delete record with key "{itemKey}" from the key-value store.\n  {message}',
			json: () => null,
		},
	},
});
