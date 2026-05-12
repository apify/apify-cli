import { defineMessages } from '../../../lib/i18n/index.js';

export const KeyValueStoresCreateCommandMessages = defineMessages({
	en: {
		duplicateName: {
			markdown: 'Cannot create a key-value store with the same name!',
			json: () => null,
		},
		createdNamed: {
			markdown: (md, colors) =>
				md(`Key-value store with ID ${colors.yellow('{id}')} (called ${colors.yellow('{name}')}) was created.`),
			json: () => null,
		},
		createdUnnamed: {
			markdown: (md, colors) => md(`Key-value store with ID ${colors.yellow('{id}')} was created.`),
			json: () => null,
		},
	},
});
