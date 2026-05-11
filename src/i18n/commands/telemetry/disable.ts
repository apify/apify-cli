import { defineMessages } from '../../../lib/i18n/index.js';

export const TelemetryDisableCommandMessages = defineMessages({
	en: {
		disabled: {
			markdown: 'Telemetry disabled.',
			json: () => null,
		},
		alreadyDisabled: {
			markdown: 'Telemetry is already disabled.',
			json: () => null,
		},
	},
});
