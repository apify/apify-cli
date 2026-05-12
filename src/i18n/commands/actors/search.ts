import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorsSearchCommandMessages = defineMessages({
	en: {
		searchFailed: {
			markdown: 'Failed to search Apify Store: {message}',
			json: () => null,
		},
		noResults: {
			markdown: 'No Actors found matching your search.',
			json: () => null,
		},
	},
});
