import { defineMessages } from '../../lib/i18n/index.js';

export const HelpCommandMessages = defineMessages({
	en: {
		commandNotFound: {
			markdown: (md, colors) => md(colors.gray(`Command ${colors.whiteBright('{commandString}')} not found`)),
			json: () => null,
		},
		commandNotFoundWithSuggestions: {
			markdown: (md, colors) =>
				md(
					`${colors.gray(`Command ${colors.whiteBright('{commandString}')} not found`)}\n  ${colors.gray(`Did you mean: {suggestions}?`)}`,
				),
			json: () => null,
		},
	},
});
