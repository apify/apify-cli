import { defineMessages } from '../../../lib/i18n/index.js';

export const DatasetsCreateCommandMessages = defineMessages({
	en: {
		alreadyExists: {
			markdown: 'A Dataset with this name already exists!',
			json: () => null,
		},
		createdWithName: {
			markdown: (md, colors) =>
				md(`Dataset with ID ${colors.yellow('{id}')} (called ${colors.yellow('{name}')}) was created.`),
			json: () => null,
		},
		created: {
			markdown: (md, colors) => md(`Dataset with ID ${colors.yellow('{id}')} was created.`),
			json: () => null,
		},
	},
});
