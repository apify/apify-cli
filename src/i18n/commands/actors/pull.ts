import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorsPullCommandMessages = defineMessages({
	en: {
		actorConfigError: {
			markdown: '{message}',
			json: () => null,
		},
		cannotFindActorInDirectory: {
			markdown: 'Cannot find Actor in this directory.',
			json: () => null,
		},
		cannotFindActorByIdOrName: {
			markdown: 'Cannot find Actor with ID/name {actorId} in your account.',
			json: () => null,
		},
		missingSourceCodeAccess: {
			markdown: 'You cannot pull source code of this Actor because you do not have permission to do so.',
			json: () => null,
		},
		actorHasNoVersions: {
			markdown: 'Actor {actorId} has no versions.',
			json: () => null,
		},
		versionNotFound: {
			markdown: 'Cannot find version {version} of Actor {actorId}.',
			json: () => null,
		},
		directoryNotEmpty: {
			markdown: 'Directory {dirpath} is not empty. Please empty it or choose another directory.',
			json: () => null,
		},
		gitPullFailed: {
			markdown: 'Failed to pull Actor from {gitRepoUrl}. {message}',
			json: () => null,
		},
		unknownSourceType: {
			markdown: 'Unknown source type: {sourceType}',
			json: () => null,
		},
		actorUpdatedAt: {
			markdown: 'Actor {name} updated at {dirpath}/',
			json: () => null,
		},
		pulledTo: {
			markdown: 'Pulled to {dirpath}/',
			json: () => null,
		},
	},
});
