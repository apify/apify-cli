import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorsCallCommandMessages = defineMessages({
	en: {
		conflictingJsonAndOutputDataset: {
			markdown: 'You cannot use both the --json and --output-dataset flags when running this command.',
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
		viewOnConsoleLine: {
			markdown: (md, colors) => md(`${colors.blue('View on Apify Console')}: {url}`),
			json: () => null,
		},
		resultLinks: {
			markdown: (md, colors) =>
				md(`\n${colors.blue('Export results')}: {datasetUrl}\n${colors.blue('View on Apify Console')}: {url}`),
			json: () => null,
		},
		actorNotFoundByFullId: {
			markdown: 'Cannot find Actor with ID {actorId} in your account.',
			json: () => null,
		},
		actorNotFoundByNameOrId: {
			markdown: 'Cannot find Actor with name or ID {actorId} in your account.',
			json: () => null,
		},
		actorNotFoundFromLocalConfig: {
			markdown:
				'Cannot find Actor with ID {actorId} in your account. Call "apify push" to push this Actor to Apify platform.',
			json: () => null,
		},
		missingActorIdentifier: {
			markdown: 'Please provide an Actor ID or name, or run this command from a directory with a valid Apify Actor.',
			json: () => null,
		},
	},
});
