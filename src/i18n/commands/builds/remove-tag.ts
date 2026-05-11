import { defineMessages } from '../../../lib/i18n/index.js';

export const BuildsRemoveTagCommandMessages = defineMessages({
	en: {
		buildNotFound: {
			markdown: 'Build with ID "{buildId}" was not found on your account.',
			json: () => null,
		},
		actorNotFound: {
			markdown: 'Actor with ID "{actorId}" was not found.',
			json: () => null,
		},
		tagDoesNotExist: {
			markdown: 'Tag "{tag}" does not exist on Actor "{actorName}".',
			json: () => null,
		},
		tagNotOnBuild: {
			markdown:
				'Tag "{tag}" is not associated with build "{buildId}". It points to build "{otherBuildNumber}" ({otherBuildId}).',
			json: () => null,
		},
		canceled: {
			markdown: 'Tag removal was canceled.',
			json: () => null,
		},
		tagRemoved: {
			markdown: (md, colors) =>
				md(
					`Tag "${colors.yellow('{tag}')}" removed from build ${colors.gray('{buildNumber}')} (${colors.gray('{buildId}')})`,
				),
			json: () => null,
		},
		tagRemoveFailed: {
			markdown: 'Failed to remove tag "{tag}" from build "{buildId}".\n  {errorMessage}',
			json: () => null,
		},
	},
});
