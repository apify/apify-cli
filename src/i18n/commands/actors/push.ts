import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorsPushCommandMessages = defineMessages({
	en: {
		noActorInDirectory: {
			markdown: 'You need to call this command from a folder that has an Actor in it!',
			json: () => null,
		},
		noValidActorFound: {
			markdown:
				'A valid Actor could not be found in the current directory. Please make sure you are in the correct directory.\nYou can also turn this directory into an Actor by running `apify init`.',
			json: () => null,
		},
		actorConfigError: {
			markdown: '{message}',
			json: () => null,
		},
		cannotFindActorById: {
			markdown: 'Cannot find Actor with ID {actorId} in your account.',
			json: () => null,
		},
		createdActor: {
			markdown: 'Created Actor with name {name} on Apify.',
			json: () => null,
		},
		deployingActor: {
			markdown: 'Deploying Actor {name} to Apify.',
			json: () => null,
		},
		remoteModifiedNewer: {
			markdown:
				'Actor with identifier "{identifier}" is already on the platform and was modified there since modified locally.\nSkipping push. Use --force to override.',
			json: () => null,
		},
		zippingActorFiles: {
			markdown: 'Zipping Actor files',
			json: () => null,
		},
		updatedVersion: {
			markdown: 'Updated version {version} for Actor {name}.',
			json: () => null,
		},
		createdVersion: {
			markdown: 'Created version {version} for Actor {name}.',
			json: () => null,
		},
		standbyToggled: {
			markdown: '{action} standby mode for Actor {name}.',
			json: () => null,
		},
		buildingActor: {
			markdown: 'Building Actor {name}',
			json: () => null,
		},
		cannotGetLog: {
			markdown: 'Can not get log:',
			json: () => null,
		},
		actorBuildDetailLabel: {
			markdown: 'Actor build detail',
			json: () => null,
		},
		actorDetailLabel: {
			markdown: 'Actor detail',
			json: () => null,
		},
		deployedSuccess: {
			markdown: 'Actor was deployed to Apify cloud and built there.',
			json: () => null,
		},
		buildWaitingForAllocation: {
			markdown: 'Build is waiting for allocation.',
			json: () => null,
		},
		buildStillRunning: {
			markdown: 'Build is still running.',
			json: () => null,
		},
		buildAborted: {
			markdown: 'Build was aborted!',
			json: () => null,
		},
		buildTimedOut: {
			markdown: 'Build timed out!',
			json: () => null,
		},
		buildFailed: {
			markdown: 'Build failed!',
			json: () => null,
		},
	},
});
