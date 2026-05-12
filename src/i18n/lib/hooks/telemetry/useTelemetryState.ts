import { defineMessages } from '../../../../lib/i18n/index.js';

export const useTelemetryStateMessages = defineMessages({
	en: {
		telemetryNotice: {
			markdown:
				'Apify collects telemetry data about general usage of Apify CLI to help us improve the product.\nThis feature is enabled by default, and you can disable it by setting the "APIFY_CLI_DISABLE_TELEMETRY" environment variable to "1", or by running "apify telemetry disable".\nYou can find more information about our telemetry in https://docs.apify.com/cli/docs/telemetry.',
			json: () => null,
		},
	},
});
