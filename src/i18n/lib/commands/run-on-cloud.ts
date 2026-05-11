import { defineMessages } from '../../../lib/i18n/index.js';

export const runOnCloudMessages = defineMessages({
	en: {
		callingActorOrTask: {
			markdown: (md, colors) => md(`Calling {type} {userFriendlyId} (${colors.gray('{id}')})\n`),
			json: () => null,
		},
		callingTaskWithTitle: {
			markdown: (md, colors) => md(`Calling {type} {title} ({userFriendlyId}, ${colors.gray('{id}')})\n`),
			json: () => null,
		},
		notFound: {
			markdown: '{type} {userFriendlyId} ({id}) not found!',
			json: () => null,
		},
		cannotGetLog: {
			markdown: 'Can not get log:',
			json: () => null,
		},
		jobSucceeded: {
			markdown: '{type} finished.',
			json: () => null,
		},
		jobStillRunning: {
			markdown: '{type} is still running!',
			json: () => null,
		},
		jobAborted: {
			markdown: '{type} was aborted!',
			json: () => null,
		},
		jobFailed: {
			markdown: '{type} failed!',
			json: () => null,
		},
	},
});
