import { defineMessages } from '../../../lib/i18n/index.js';

export const DatasetsPushDataCommandMessages = defineMessages({
	en: {
		datasetNotFound: {
			markdown: 'Dataset with ID or name "{nameOrId}" not found.',
			json: () => null,
		},
		noItemsProvided: {
			markdown: 'No items were provided.',
			json: () => null,
		},
		parseError: {
			markdown: 'Failed to parse data as JSON string: {message}',
			json: () => null,
		},
		pushedNamed: {
			markdown: (md, colors) =>
				md(
					`{pluralLabel} pushed to Dataset named ${colors.yellow('{name}')} (${colors.gray('ID:')} ${colors.yellow('{id}')}) successfully.`,
				),
			json: () => null,
		},
		pushedUnnamed: {
			markdown: (md, colors) =>
				md(`{pluralLabel} pushed to Dataset with ID ${colors.yellow('{id}')} successfully.`),
			json: () => null,
		},
		pushFailedNamed: {
			markdown: (md, colors) =>
				md(
					`Failed to push items into Dataset named ${colors.yellow('{name}')} (${colors.gray('ID:')} ${colors.yellow('{id}')})\n  {message}`,
				),
			json: () => null,
		},
		pushFailedUnnamed: {
			markdown: (md, colors) =>
				md(`Failed to push items into Dataset with ID ${colors.yellow('{id}')}\n  {message}`),
			json: () => null,
		},
	},
});
