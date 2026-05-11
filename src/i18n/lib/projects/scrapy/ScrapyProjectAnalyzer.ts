import { defineMessages } from '../../../../lib/i18n/index.js';

export const ScrapyProjectAnalyzerMessages = defineMessages({
	en: {
		scrapyCfgNotFound: {
			markdown: 'scrapy.cfg not found in "{scrapyCfgPath}".\nAre you sure there is a Scrapy project there?',
			json: () => null,
		},
		spiderModulesMissing: {
			markdown: 'SPIDER_MODULES path not found in settings.',
			json: () => null,
		},
	},
});
