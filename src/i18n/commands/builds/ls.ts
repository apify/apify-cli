import { defineMessages } from '../../../lib/i18n/index.js';

export const BuildsLsCommandMessages = defineMessages({
	en: {
		invalidActorContext: {
			markdown: '{reason}. Please run this command in an Actor directory, or specify the Actor ID.',
			json: () => null,
		},
		showingBuildsHeader: {
			markdown: (md, colors) =>
				md(
					`${colors.reset('Showing')} ${colors.yellow('{shown,number}')} out of ${colors.yellow('{total,number}')} builds for Actor ${colors.yellow('{userFriendlyId}')} (${colors.gray('{actorId}')})\n`,
				),
			json: () => null,
		},
		noBuildsForVersion: {
			markdown: 'No builds for version {actorVersion}',
			json: () => null,
		},
		buildsForVersionHeader: {
			markdown: (md, colors) =>
				md(colors.reset(`Builds for Actor Version ${colors.yellow('{actorVersion}')}{latestBuildTagMessage}`)),
			json: () => null,
		},
		latestBuildTagSuffix: {
			markdown: (md, colors) => md(` (latest build gets tagged with ${colors.yellow('{latestBuildTag}')})`),
			json: () => null,
		},
	},
});
