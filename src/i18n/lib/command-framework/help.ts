import { defineMessages } from '../../../lib/i18n/index.js';

export const helpMessages = defineMessages({
	en: {
		commandNameMisconfigured: {
			markdown:
				'Command name "{commandName}" is not correctly set up internally. Make sure you fill out the "name" field in the command class extension.',
			json: () => null,
		},
		noHelpRenderer: {
			markdown: 'No help renderer found for command {commandName}',
			json: () => null,
		},
	},
});
