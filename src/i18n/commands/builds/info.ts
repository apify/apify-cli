import { defineMessages } from '../../../lib/i18n/index.js';

export const BuildsInfoCommandMessages = defineMessages({
	en: {
		buildNotFound: {
			markdown: 'Build with ID "{buildId}" was not found on your account.',
			json: () => null,
		},
		header: {
			markdown: (md, colors) =>
				md(
					`${colors.yellow('Actor')}: {fullActorName} (${colors.gray('{actId}')})\n\n${colors.yellow('Build Information')} (ID: ${colors.gray('{buildId}')})\n  ${colors.yellow('Build Number')}: {buildNumber}{versionTaggedAs}\n  ${colors.yellow('Status')}: {status}{exitCodeStatus}\n  ${colors.yellow('Started')}: {startedAt}`,
				),
			json: () => null,
		},
		versionTaggedAs: {
			markdown: (md, colors) => md(` (tagged as ${colors.yellow('{buildTag}')})`),
			json: () => null,
		},
		exitCodeStatus: {
			markdown: (md, colors) => md(` (exit code: ${colors.gray('{exitCode}')})`),
			json: () => null,
		},
		finishedAtLine: {
			markdown: (md, colors) => md(`  ${colors.yellow('Finished')}: {finishedAt} (took ${colors.gray('{duration}')})`),
			json: () => null,
		},
		runningForLine: {
			markdown: (md, colors) => md(`  ${colors.yellow('Finished')}: ${colors.gray('Running for {duration}')}`),
			json: () => null,
		},
		computeUnitsLine: {
			markdown: (md, colors) => md(`  ${colors.yellow('Compute Units')}: {computeUnits}`),
			json: () => null,
		},
		dockerImageSizeLine: {
			markdown: (md, colors) => md(`  ${colors.yellow('Docker Image Size')}: {size}`),
			json: () => null,
		},
		originLine: {
			markdown: (md, colors) => md(`  ${colors.yellow('Origin')}: {origin}`),
			json: () => null,
		},
		viewInConsole: {
			markdown: (md, colors) => md(`${colors.blue('View in Apify Console')}: {url}`),
			json: () => null,
		},
	},
});
