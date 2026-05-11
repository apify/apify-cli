import { defineMessages } from '../../../lib/i18n/index.js';

export const KeyValueStoresRmCommandMessages = defineMessages({
	en: {
		storeNotFound: {
			markdown: 'Key-value store with ID or name "{nameOrId}" not found.',
			json: () => null,
		},
		deletionAborted: {
			markdown: 'Key-value store deletion has been aborted.',
			json: () => null,
		},
		deletedNamed: {
			markdown: (md, colors) =>
				md(
					`Key-value store with ID ${colors.yellow('{id}')} (called ${colors.yellow('{name}')}) has been deleted.`,
				),
			json: () => null,
		},
		deletedUnnamed: {
			markdown: (md, colors) => md(`Key-value store with ID ${colors.yellow('{id}')} has been deleted.`),
			json: () => null,
		},
		deleteFailed: {
			markdown: (md, colors) =>
				md(`Failed to delete key-value store with ID ${colors.yellow('{id}')}\n  {message}`),
			json: () => null,
		},
	},
});
