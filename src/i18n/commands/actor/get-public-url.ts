import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorGetPublicUrlCommandMessages = defineMessages({
	en: {
		notImplementedLocally: {
			markdown: 'get-public-url is not yet implemented for local development',
			json: () => null,
		},
		missingEnvVar: {
			markdown: 'Missing environment variable: {envVar}. Please set it before running the command.',
			json: () => null,
		},
		storeNotFound: {
			markdown:
				"Key-Value store with ID ''{storeId}'' was not found. Ensure the store exists and that the correct ID is set in {envVar}.",
			json: () => null,
		},
	},
});
