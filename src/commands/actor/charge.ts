import { APIFY_ENV_VARS } from '@apify/consts';
import { Args, Flags } from '@oclif/core';

import { getApifyClient } from '../../lib/actor.js';
import { ApifyCommand } from '../../lib/apify_command.js';

/**
 * TODO - add logic to work with the max charge USD to prevent
 * exceeding the charging limit.
 */
export class ChargeCommand extends ApifyCommand<typeof ChargeCommand> {
	static override description = 'Charge for a specific event in the pay-per-event Actor run.\n';

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
		const { args, flags } = await this.parse(ChargeCommand);

		const { eventName } = args;
		const { count } = flags;
		const testPayPerEvent = flags['test-pay-per-event'];
		const idempotencyKey = flags['idempotency-key'];

		this.log('args', args);
		this.log('flags', flags);
		const isAtHome = Boolean(process.env.APIFY_IS_AT_HOME);

		if (!isAtHome || testPayPerEvent) {
			// TODO - add option to also add the data to a test named dataset
			this.log(`Would charge ${count} events of type "${eventName}" with idempotency key "${idempotencyKey}".`);
		} else {
			const apifyClient = await getApifyClient();
			const runId = process.env[APIFY_ENV_VARS.ACTOR_RUN_ID];

			if (!runId) {
				throw new Error('Charge command must be executed in a running Actor. Run ID not found.');
			}

			this.log(
				`Charging ${count} events of type "${eventName}" with idempotency key "${idempotencyKey}" (runId: ${runId}).`,
			);
			await apifyClient.run(runId).charge({
				eventName,
				count,
				idempotencyKey,
			});
		}
	}
}
