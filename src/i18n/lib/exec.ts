import { defineMessages } from '../../lib/i18n/index.js';

export const execMessages = defineMessages({
	en: {
		exitedWithCode: {
			markdown: '{cmd} exited with code {exitCode,number}',
			json: () => null,
		},
		exitedDueToSignal: {
			markdown: '{cmd} exited due to signal {signal}',
			json: () => null,
		},
		runningCommand: {
			markdown: '{command} {args}',
			json: () => null,
		},
	},
});
