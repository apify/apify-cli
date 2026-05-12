import { defineMessages } from '../../../lib/i18n/index.js';

export const SecretsLsCommandMessages = defineMessages({
	en: {
		noSecrets: {
			markdown: "You don't have any secrets stored locally. Use 'apify secrets add' to add a secret.",
			json: () => null,
		},
	},
});
