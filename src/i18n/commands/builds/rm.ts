import { defineMessages } from '../../../lib/i18n/index.js';

export const BuildsRmCommandMessages = defineMessages({
	en: {
		buildNotFound: {
			markdown: 'Build with ID "{buildId}" was not found on your account.',
			json: () => null,
		},
		deletionCanceled: {
			markdown: 'Deletion of build "{buildId}" was canceled.',
			json: () => null,
		},
		buildDeleted: {
			markdown: 'Build with ID "{buildId}" was deleted.',
			json: () => null,
		},
	},
});
