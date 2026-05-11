import { defineMessages } from '../../../lib/i18n/index.js';

export const BuildsAddTagCommandMessages = defineMessages({
	en: {
		buildNotFound: {
			markdown: 'Build with ID "{buildId}" was not found on your account.',
			json: () => null,
		},
		buildNotSucceeded: {
			markdown: 'Build with ID "{buildId}" has status "{status}". Only successful builds can be tagged.',
			json: () => null,
		},
		actorNotFound: {
			markdown: 'Actor with ID "{actorId}" was not found.',
			json: () => null,
		},
		tagAlreadyPointsToBuild: {
			markdown: 'Build "{buildId}" is already tagged as "{tag}".',
			json: () => null,
		},
		tagAddedWithPrevious: {
			markdown: (md, colors) =>
				md(
					`Tag "${colors.yellow('{tag}')}" added to build ${colors.gray('{buildNumber}')} (${colors.gray('{buildId}')}) (previously pointed to build ${colors.gray('{previousBuildNumber}')})`,
				),
			json: () => null,
		},
		tagAdded: {
			markdown: (md, colors) =>
				md(
					`Tag "${colors.yellow('{tag}')}" added to build ${colors.gray('{buildNumber}')} (${colors.gray('{buildId}')})`,
				),
			json: () => null,
		},
		tagAddFailed: {
			markdown: 'Failed to add tag "{tag}" to build "{buildId}".\n  {errorMessage}',
			json: () => null,
		},
	},
});
