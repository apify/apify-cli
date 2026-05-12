import { defineMessages } from '../../../../lib/i18n/index.js';

export const wrapScrapyProjectMessages = defineMessages({
	en: {
		bindingNotFound: {
			markdown: 'Binding for {part} not found.',
			json: () => null,
		},
		apifySettingsAlreadyPresent: {
			markdown:
				"The Scrapy project configuration already contains Apify settings. Are you sure you didn't already wrap this project?",
			json: () => null,
		},
		downloadingTemplate: {
			markdown: 'Downloading the latest Scrapy wrapper template...',
			json: () => null,
		},
		wrappingProject: {
			markdown: 'Wrapping the Scrapy project...',
			json: () => null,
		},
		wrappedSuccessfully: {
			markdown: 'The Scrapy project has been wrapped successfully.',
			json: () => null,
		},
	},
});
