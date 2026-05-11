import { defineMessages } from '../../lib/i18n/index.js';

export const secretsMessages = defineMessages({
	en: {
		secretAlreadyExists: {
			markdown: 'Secret with name {name} already exists. Call "apify secrets rm {name}" to remove it.',
			json: () => null,
		},
		secretNameTooLong: {
			markdown: 'Secret name has to be string with maximum length {maxLength,number}.',
			json: () => null,
		},
		secretValueTooLong: {
			markdown: 'Secret value has to be string with maximum length {maxLength,number}.',
			json: () => null,
		},
		secretNotFound: {
			markdown: "Secret with name {name} doesn't exist.",
			json: () => null,
		},
		missingSecretWarning: {
			markdown:
				'Value for {secretKey} not found in local secrets. Set it by calling "apify secrets add {secretKey} [SECRET_VALUE]"',
			json: () => null,
		},
		missingSecretsList: {
			markdown: `The following secrets are missing:\n{secretsList}\n\nSet them by calling "apify secrets add '<'SECRET_NAME'>' '<'SECRET_VALUE'>'" for each missing secret.\nIf you want to skip missing secrets, run the command with the --allow-missing-secrets flag.`,
			json: () => null,
		},
	},
});
