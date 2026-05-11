import { defineMessages } from '../../../lib/i18n/index.js';

export const DatasetsRmCommandMessages = defineMessages({
	en: {
		datasetNotFound: {
			markdown: 'Dataset with ID or name "{datasetNameOrId}" not found.',
			json: () => null,
		},
		deletionAborted: {
			markdown: 'Dataset deletion has been aborted.',
			json: () => null,
		},
		deletedWithName: {
			markdown: (md, colors) =>
				md(`Dataset with ID ${colors.yellow('{id}')} (called ${colors.yellow('{name}')}) has been deleted.`),
			json: () => null,
		},
		deletedUnnamed: {
			markdown: (md, colors) => md(`Dataset with ID ${colors.yellow('{id}')} has been deleted.`),
			json: () => null,
		},
		deleteFailed: {
			markdown: (md, colors) => md(`Failed to delete dataset with ID ${colors.yellow('{id}')}\n  {message}`),
			json: () => null,
		},
	},
});
