import { APIFY_ENV_VARS } from '@apify/consts';
import { Args, Flags } from '@oclif/core';

import { getApifyTokenFromEnvOrAuthFile } from '../../lib/actor.js';
import { ApifyCommand } from '../../lib/apify_command.js';
import { info } from '../../lib/outputs.js';
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
export class ChargeCommand extends ApifyCommand<typeof ChargeCommand> {
	static override description = 'Charge for a specific event in the pay-per-event Actor run.';

	static override args = {
		eventName: Args.string({
			description: 'Name of the event to charge for',
			required: true,
		}),
	};

	static override flags = {
		'count': Flags.integer({
			description: 'Number of events to charge',
			required: false,
			default: 1,
		}),
		'idempotency-key': Flags.string({
			description: 'Idempotency key for the charge request',
			required: false,
		}),
		'test-pay-per-event': Flags.boolean({
			description: 'Test pay-per-event charging without actually charging',
			required: false,
			default: false,
		}),
	};

	async run() {
		const { eventName } = this.args;
		const { count, testPayPerEvent, idempotencyKey } = this.flags;

		const isAtHome = Boolean(process.env.APIFY_IS_AT_HOME);

		if (!isAtHome) {
			info({
				message: `No platform detected: would charge ${count} events of type "${eventName}" with idempotency key "${idempotencyKey ?? 'not-provided'}".`,
				stdout: true,
			});
			return;
		}

		if (testPayPerEvent) {
			info({
				message: `PPE test mode: would charge ${count} events of type "${eventName}" with idempotency key "${idempotencyKey ?? 'not-provided'}".`,
				stdout: true,
			});
			return;
		}

		const apifyToken = await getApifyTokenFromEnvOrAuthFile();
		const apifyClient = await getLoggedClient(apifyToken);
		if (!apifyClient) {
			throw new Error('Apify token is not set. Please set it using the environment variable APIFY_TOKEN.');
		}
		const runId = process.env[APIFY_ENV_VARS.ACTOR_RUN_ID];

		if (!runId) {
			throw new Error('Charge command must be executed in a running Actor. Run ID not found.');
		}

		const run = await apifyClient.run(runId).get();
		if (run?.pricingInfo?.pricingModel !== 'PAY_PER_EVENT') {
			throw new Error('Charge command can only be used with pay-per-event pricing model.');
		}

		info({
			message: `Charging ${count} events of type "${eventName}" with idempotency key "${idempotencyKey ?? 'not-provided'}" (runId: ${runId}).`,
			stdout: true,
		});
		await apifyClient.run(runId).charge({
			eventName,
			count,
			idempotencyKey,
		});
	}
}
