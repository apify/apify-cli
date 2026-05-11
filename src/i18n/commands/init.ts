import { defineMessages } from '../../lib/i18n/index.js';

export const InitCommandMessages = defineMessages({
	en: {
		projectError: {
			markdown: '{message}',
			json: () => null,
		},
		warning: {
			markdown: '{warning}',
			json: () => null,
		},
		scrapyDetected: {
			markdown: 'The current directory looks like a Scrapy project. Using automatic project wrapping.',
			json: () => null,
		},
		notJsOrPython: {
			markdown: 'The current directory does not look like a Node.js or Python project.',
			json: () => null,
		},
		actorConfigError: {
			markdown: '{message}',
			json: () => null,
		},
		configExists: {
			markdown: 'Skipping creation of `{configPath}`, the file already exists in the current directory.',
			json: () => null,
		},
		invalidActorName: {
			markdown: '{message}',
			json: () => null,
		},
		initialized: {
			markdown: 'The Actor has been initialized in the current directory.',
			json: () => null,
		},
	},
});
