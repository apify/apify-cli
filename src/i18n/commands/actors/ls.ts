import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorsLsCommandMessages = defineMessages({
	en: {
		noActorsOwned: {
			markdown: "You don't have any Actors yet!",
			json: () => null,
		},
		noRecentActors: {
			markdown: 'There are no recent Actors used by you.',
			json: () => null,
		},
	},
});
