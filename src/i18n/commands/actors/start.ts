import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorsStartCommandMessages = defineMessages({
	en: {
		callingActor: {
			markdown: (md, colors) =>
				md(`${colors.gray('Run:')} Calling Actor {userFriendlyId} (${colors.gray('{actorId}')})`),
			json: () => null,
		},
		runStartedHeader: {
			markdown: (md, colors) => md(`${colors.yellow('Started')}: {startedAt}`),
			json: () => null,
		},
		containerUrlLine: {
			markdown: (md, colors) => md(`${colors.yellow('Container URL')}: ${colors.blue('{containerUrl}')}`),
			json: () => null,
		},
		buildLine: {
			markdown: (md, colors) =>
				md(`${colors.yellow('Build')}: ${colors.cyan('{buildNumber}')} ({buildTag}){actorVersionInfo}`),
			json: () => null,
		},
		buildTagNa: {
			markdown: (md, colors) => md(colors.gray('N/A')),
			json: () => null,
		},
		buildTagValue: {
			markdown: (md, colors) => md(colors.yellow('{tag}')),
			json: () => null,
		},
		actorVersionInfo: {
			markdown: (md, colors) =>
				md(` | ${colors.gray('Actor version:')} ${colors.cyan('{versionNumber}')} (${colors.yellow('{buildTag}')})`),
			json: () => null,
		},
		timeoutLine: {
			markdown: (md, colors) => md(`${colors.yellow('Timeout')}: {timeoutSecs} seconds`),
			json: () => null,
		},
		memoryLine: {
			markdown: (md, colors) => md(`${colors.yellow('Memory')}: {memoryMbytes,number} MB`),
			json: () => null,
		},
		resultLinks: {
			markdown: (md, colors) =>
				md(`\n${colors.blue('Export results')}: {datasetUrl}\n${colors.blue('View on Apify Console')}: {url}`),
			json: () => null,
		},
	},
});
