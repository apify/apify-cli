import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorsRmCommandMessages = defineMessages({
	en: {
		actorNotFound: {
			markdown: 'Actor with ID "{actorId}" was not found on your account.',
			json: () => null,
		},
		deletionCanceled: {
			markdown: 'Deletion of Actor "{actorId}" was canceled.',
			json: () => null,
		},
		actorDeleted: {
			markdown: 'Actor with ID "{actorId}" was deleted.',
			json: () => null,
		},
		deleteFailed: {
			markdown: 'Failed to delete Actor "{actorId}".\n  {message}',
			json: () => null,
		},
	},
});
