import { defineMessages } from '../../../lib/i18n/index.js';

export const DatasetsGetItemsMessages = defineMessages({
	en: {
		datasetNotFound: {
			markdown: 'Dataset with ID "{datasetId}" not found.',
			json: () => null,
		},
		contentType: {
			markdown: '{contentType}',
			json: () => null,
		},
	},
});
