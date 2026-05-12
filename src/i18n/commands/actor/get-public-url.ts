import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorGetPublicUrlCommandMessages = defineMessages({
	en: {
		notImplementedLocally: {
			markdown: 'get-public-url is not yet implemented for local development',
			json: () => ({ code: 'NOT_SUPPORTED_LOCALLY' }),
		},
		missingEnvVar: {
			markdown: 'Missing environment variable: {envVar}. Please set it before running the command.',
			json: (envVar: string) => ({ code: 'MISSING_ENV_VAR', environmentVariable: envVar }),
		},
		storeNotFound: {
			markdown:
				"Key-Value store with ID ''{storeId}'' was not found. Ensure the store exists and that the correct ID is set in `{envVar}`.",
			json: ({ storeId, envVar }: { storeId: string; envVar: string }) => ({
				code: 'KEY_VALUE_STORE_NOT_FOUND',
				keyValueStoreId: storeId,
				environmentVariable: envVar,
			}),
		},
	},
});
