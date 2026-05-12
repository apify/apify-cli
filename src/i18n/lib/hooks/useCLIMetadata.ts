import { defineMessages } from '../../../lib/i18n/index.js';

export const useCLIMetadataMessages = defineMessages({
	en: {
		failedToDetectInstallMethod: {
			markdown: 'Failed to detect install method of CLI, assuming npm',
			json: () => null,
		},
	},
});
