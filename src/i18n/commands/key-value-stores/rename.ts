import { defineMessages } from '../../../lib/i18n/index.js';

export const KeyValueStoresRenameCommandMessages = defineMessages({
	en: {
		missingNameOrUnname: {
			markdown: 'You must provide either a new name or the --unname flag.',
			json: () => null,
		},
		conflictingNameAndUnname: {
			markdown: 'You cannot provide a new name and the --unname flag.',
			json: () => null,
		},
		storeNotFound: {
			markdown: 'Key-value store with ID or name "{nameOrId}" not found.',
			json: () => null,
		},
		nameSet: {
			markdown: (md, colors) =>
				md(
					`The name of the key-value store with ID ${colors.yellow('{id}')} has been set to: ${colors.yellow('{newName}')}`,
				),
			json: () => null,
		},
		nameRemoved: {
			markdown: (md, colors) =>
				md(
					`The name of the key-value store with ID ${colors.yellow('{id}')} has been removed (was ${colors.yellow('{name}')} previously).`,
				),
			json: () => null,
		},
		nameChanged: {
			markdown: (md, colors) =>
				md(
					`The name of the key-value store with ID ${colors.yellow('{id}')} was changed from ${colors.yellow('{name}')} to ${colors.yellow('{newName}')}.`,
				),
			json: () => null,
		},
		renameFailed: {
			markdown: (md, colors) => md(`Failed to rename key-value store with ID ${colors.yellow('{id}')}\n  {message}`),
			json: () => null,
		},
	},
});
