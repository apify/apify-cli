import { defineMessages } from '../../lib/i18n/index.js';

export const sharedEntrypointMessages = defineMessages({
	en: {
		unsupportedNodeVersion: {
			markdown:
				'{cliName} CLI requires Node.js version {supportedRange}. Your current version is {currentVersion}.',
			json: () => null,
		},
		commandNotFound: {
			markdown: (md, colors) => md(colors.gray(`Command ${colors.whiteBright('{commandName}')} not found`)),
			json: () => null,
		},
		commandNotFoundWithSuggestions: {
			markdown: (md, colors) =>
				md(
					`${colors.gray(`Command ${colors.whiteBright('{commandName}')} not found`)}\n  ${colors.gray(`Did you mean: {suggestions}?`)}`,
				),
			json: () => null,
		},
	},
});
