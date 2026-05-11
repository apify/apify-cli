import { defineMessages } from '../../lib/i18n/index.js';

export const utilsMessages = defineMessages({
	en: {
		corruptedLocalUserInfo: {
			markdown: 'Corrupted local user info was found. Please run "apify login" to fix it.',
			json: () => null,
		},
		notLoggedIn: {
			markdown: 'You are not logged in with your Apify account. Call "apify login" to fix that.',
			json: () => null,
		},
		actorNameInvalidDns: {
			markdown: 'The Actor name must be a DNS hostname-friendly string (e.g. my-newest-actor).',
			json: () => null,
		},
		actorNameTooShort: {
			markdown: 'The Actor name must be at least 3 characters long.',
			json: () => null,
		},
		actorNameTooLong: {
			markdown: 'The Actor name must be a maximum of 30 characters long.',
			json: () => null,
		},
	},
});
