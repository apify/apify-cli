import { defineMessages } from '../../../../lib/i18n/index.js';

export const stdinCheckWrapperMessages = defineMessages({
	en: {
		useConfirmFlags: {
			markdown: 'Please use the --{confirmFlag}/--{noConfirmFlag} flags to confirm the action.',
			json: () => null,
		},
	},
});
