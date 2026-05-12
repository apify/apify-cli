import { defineMessages } from '../../../lib/i18n/index.js';

export interface ActorChargeCommandMessagesCommonProps {
	count: number;
	eventName: string;
	idempotencyKey: string;
}

export const ActorChargeCommandMessages = defineMessages({
	en: {
		noPlatformDetected: {
			markdown:
				'No platform detected: would charge `{count,number}` events of type "{eventName}" with idempotency key "{idempotencyKey}".',
			json: (props: ActorChargeCommandMessagesCommonProps) => ({ ...props, code: 'NO_PLATFORM_DETECTED' }),
		},
		ppeTestMode: {
			markdown:
				'PPE test mode: would charge `{count,number}` events of type "{eventName}" with idempotency key "{idempotencyKey}".',
			json: (props: ActorChargeCommandMessagesCommonProps) => ({ ...props, code: 'PPE_TEST_MODE' }),
		},
		missingApifyToken: {
			markdown: 'Apify token is not set. Please set it using the environment variable APIFY_TOKEN.',
			json: () => ({
				code: 'MISSING_APIFY_TOKEN',
				hint: 'login with `apify auth login` or set APIFY_TOKEN environment variable',
			}),
		},
		notInRunningActor: {
			markdown: 'Charge command must be executed in a running Actor. Run ID not found.',
			json: () => ({ code: 'NO_RUN_ID_FOUND', hint: 'run the command in a running Actor' }),
		},
		invalidPricingModel: {
			markdown: 'Charge command can only be used with pay-per-event pricing model.',
			json: (currentPricingModel: string) => ({
				code: 'INVALID_PRICING_MODEL',
				currentPricingModel,
				expectedPricingModel: 'PAY_PER_EVENT',
				hint: 'can be used only within pay-per-event Actor',
			}),
		},
		charging: {
			markdown:
				'Charging {count,number} events of type "{eventName}" with idempotency key "{idempotencyKey}" (runId: {runId}).',
			json: (props: ActorChargeCommandMessagesCommonProps & { runId: string }) => ({
				...props,
				code: 'CHARGING',
			}),
		},
	},
});
