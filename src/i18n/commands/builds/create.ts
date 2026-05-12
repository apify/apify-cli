import { defineMessages } from '../../../lib/i18n/index.js';

export const BuildsCreateCommandMessages = defineMessages({
	en: {
		invalidActorContext: {
			markdown: '{reason}. Please run this command in an Actor directory, or specify the Actor ID.',
			json: () => null,
		},
		versionDoesNotHaveTag: {
			markdown: 'The Actor Version "{version}" does not have the tag "{tag}".',
			json: () => null,
		},
		multipleVersionsForTag: {
			markdown:
				'Multiple Actor versions with the tag "{tag}" found. Please specify the version number using the "--version" flag.\n  Available versions for this tag: {availableVersions}',
			json: () => null,
		},
		noVersionsForTag: {
			markdown:
				'No Actor versions with the tag "{tag}" found. You can push a new version with this tag by using "apify push --build-tag={tag}".',
			json: () => null,
		},
		buildStartedMessage: {
			markdown: (md, colors) =>
				md(
					`${colors.yellow('Actor')}: {fullActorName} (${colors.gray('{actId}')})\n  ${colors.yellow('Version')}: {selectedVersion} (tagged with ${colors.yellow('{actualTag}')})\n\n${colors.greenBright('Build Started')} (ID: ${colors.gray('{buildId}')})\n  ${colors.yellow('Build Number')}: {buildNumber} (will get tagged once finished)\n  ${colors.yellow('Started')}: {startedAt}\n`,
				),
			json: () => null,
		},
		viewInConsole: {
			markdown: (md, colors) => md(`${colors.blue('View in Apify Console')}: {url}`),
			json: () => null,
		},
		logFailed: {
			markdown: 'Failed to print log for build with ID "{buildId}": {message}',
			json: () => null,
		},
	},
});
