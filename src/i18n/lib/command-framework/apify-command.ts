import { defineMessages } from '../../../lib/i18n/index.js';

export const apifyCommandMessages = defineMessages({
	en: {
		missingRequiredArgsHeader: {
			markdown: 'Missing {count,number} required {count,plural,one{argument}other{arguments}}:',
			json: () => null,
		},
		seeMoreHelp: {
			markdown: (md, colors) => md(colors.gray('  See more help with --help')),
			json: () => null,
		},
	},
});
