import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorChargeCommandMessages = defineMessages({
	en: {
		noPlatformDetected: {
			markdown:
				'No platform detected: would charge {count,number} events of type "{eventName}" with idempotency key "{idempotencyKey}".',
			json: () => null,
		},
		ppeTestMode: {
			markdown:
				'PPE test mode: would charge {count,number} events of type "{eventName}" with idempotency key "{idempotencyKey}".',
			json: () => null,
		},
		missingApifyToken: {
			markdown: 'Apify token is not set. Please set it using the environment variable APIFY_TOKEN.',
			json: () => null,
		},
		notInRunningActor: {
			markdown: 'Charge command must be executed in a running Actor. Run ID not found.',
			json: () => null,
		},
		invalidPricingModel: {
			markdown: 'Charge command can only be used with pay-per-event pricing model.',
			json: () => null,
		},
		charging: {
			markdown:
				'Charging {count,number} events of type "{eventName}" with idempotency key "{idempotencyKey}" (runId: {runId}).',
			json: () => null,
		},
	},
});
