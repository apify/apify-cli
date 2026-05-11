import { defineMessages } from '../../../lib/i18n/index.js';

export const TaskRunCommandMessages = defineMessages({
	en: {
		resultLinks: {
			markdown: (md, colors) =>
				md(`\n${colors.blue('Export results')}: {datasetUrl}\n${colors.blue('View on Apify Console')}: {url}`),
			json: () => null,
		},
		taskNotFoundById: {
			markdown: "Cannot find Task with ID ''{taskId}'' in your account.",
			json: () => null,
		},
		taskNotFoundByName: {
			markdown: "Cannot find Task with name ''{taskId}'' in your account.",
			json: () => null,
		},
		invalidTaskIdentifier: {
			markdown: 'Please provide a valid Task ID or name.',
			json: () => null,
		},
	},
});
