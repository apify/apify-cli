import { ActorChargeCommandMessages } from '#i18n/commands/actor/charge.js';

import { APIFY_ENV_VARS } from '@apify/consts';

import { getApifyTokenFromEnvOrAuthFile } from '../../lib/actor.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { getLoggedClient } from '../../lib/utils.js';

/**
 * This command can be used to charge for a specific event in the pay-per-event Actor run.
 * - If run locally or with the --test-pay-per-event flag, it will only log the charge request, without actually charging.
 * - If run in the Actor run on Apify platform without the testing flag, it will charge the specified amount of events.
 *
 * Future TODOs:
 * - Add logic to work with the max charge USD to prevent exceeding the charging limit.
 * - Add logic to store events in the log dataset for later inspection to aid local development.
 */
export class ActorChargeCommand extends ApifyCommand<typeof ActorChargeCommand> {
	static override name = 'charge' as const;

	static override description = 'Charge for a specific event in a pay-per-event Actor run.';

	static override group = 'Actor Runtime';

	static override examples = [
		{
			description: 'Charge one event of the given type.',
			command: 'actor charge result-item',
		},
		{
			description: 'Charge 5 events with an idempotency key.',
			command: 'actor charge result-item --count 5 --idempotency-key req-123',
		},
		{
			description: 'Test locally without actually charging.',
			command: 'actor charge result-item --test-pay-per-event',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#actor-charge';

	static override args = {
		eventName: Args.string({
			description: 'Name of the event to charge for.',
			required: true,
		}),
	};

	static override flags = {
		'count': Flags.integer({
			description: 'Number of events to charge.',
			required: false,
			default: 1,
		}),
		'idempotency-key': Flags.string({
			description: 'Idempotency key for the charge request.',
			required: false,
		}),
		'test-pay-per-event': Flags.boolean({
			description: 'Test pay-per-event charging without actually charging.',
			required: false,
			default: false,
		}),
	};

	async run() {
		const { eventName } = this.args;
		const { count, testPayPerEvent, idempotencyKey } = this.flags;
		const idempotencyKeyDisplay = idempotencyKey ?? 'not-provided';

		const isAtHome = Boolean(process.env.APIFY_IS_AT_HOME);

		if (!isAtHome) {
			this.logger.stdout.info(
				this.t(ActorChargeCommandMessages.noPlatformDetected, {
					count,
					eventName,
					idempotencyKey: idempotencyKeyDisplay,
				}),
			);
			return;
		}

		if (testPayPerEvent) {
			this.logger.stdout.info(
				this.t(ActorChargeCommandMessages.ppeTestMode, {
					count,
					eventName,
					idempotencyKey: idempotencyKeyDisplay,
				}),
			);
			return;
		}

		const apifyToken = await getApifyTokenFromEnvOrAuthFile();
		const apifyClient = await getLoggedClient(apifyToken);
		if (!apifyClient) {
			throw new Error(this.t(ActorChargeCommandMessages.missingApifyToken));
		}
		const runId = process.env[APIFY_ENV_VARS.ACTOR_RUN_ID];

		if (!runId) {
			throw new Error(this.t(ActorChargeCommandMessages.notInRunningActor));
		}

		const run = await apifyClient.run(runId).get();
		if (run?.pricingInfo?.pricingModel !== 'PAY_PER_EVENT') {
			throw new Error(this.t(ActorChargeCommandMessages.invalidPricingModel));
		}

		this.logger.stdout.info(
			this.t(ActorChargeCommandMessages.charging, {
				count,
				eventName,
				idempotencyKey: idempotencyKeyDisplay,
				runId,
			}),
		);
		await apifyClient.run(runId).charge({
			eventName,
			count,
			idempotencyKey,
		});
	}
}
