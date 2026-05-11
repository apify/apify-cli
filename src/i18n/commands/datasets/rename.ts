import { defineMessages } from '../../../lib/i18n/index.js';

export const DatasetsRenameCommandMessages = defineMessages({
	en: {
		mustProvideNameOrUnname: {
			markdown: 'You must provide either a new name or the --unname flag.',
			json: () => null,
		},
		cannotProvideBoth: {
			markdown: 'You cannot provide a new name and the --unname flag.',
			json: () => null,
		},
		datasetNotFound: {
			markdown: 'Dataset with ID or name "{nameOrId}" not found.',
			json: () => null,
		},
		nameSet: {
			markdown: (md, colors) =>
				md(
					`The name of the dataset with ID ${colors.yellow('{id}')} has been set to: ${colors.yellow('{newName}')}`,
				),
			json: () => null,
		},
		nameRemoved: {
			markdown: (md, colors) =>
				md(
					`The name of the dataset with ID ${colors.yellow('{id}')} has been removed (was ${colors.yellow('{previousName}')} previously).`,
				),
			json: () => null,
		},
		nameChanged: {
			markdown: (md, colors) =>
				md(
					`The name of the dataset with ID ${colors.yellow('{id}')} was changed from ${colors.yellow('{previousName}')} to ${colors.yellow('{newName}')}.`,
				),
			json: () => null,
		},
		renameFailed: {
			markdown: (md, colors) => md(`Failed to rename dataset with ID ${colors.yellow('{id}')}\n  {message}`),
			json: () => null,
		},
	},
});
