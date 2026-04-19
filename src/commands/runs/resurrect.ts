import type { ApifyApiError } from 'apify-client';

import { ACTOR_JOB_STATUSES } from '@apify/consts';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

const resurrectStatuses = [
	ACTOR_JOB_STATUSES.SUCCEEDED,
	ACTOR_JOB_STATUSES.FAILED,
	ACTOR_JOB_STATUSES.ABORTED,
	ACTOR_JOB_STATUSES.TIMED_OUT,
];

export class RunsResurrectCommand extends ApifyCommand<typeof RunsResurrectCommand> {
	static override name = 'resurrect' as const;

	static override description = 'Resurrects an aborted or finished Actor Run.';

	static override args = {
		runId: Args.string({
			required: true,
			description: 'The run ID to resurrect.',
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { runId } = this.args;

		const apifyClient = await getLoggedClientOrThrow();

		const run = await apifyClient.run(runId).get();

		if (!run) {
			this.logger.stdout.error(`Run with ID "${runId}" was not found on your account.`);
			return;
		}

		if (!resurrectStatuses.includes(run.status as never)) {
			this.logger.stdout.error(
				`Run with ID "${runId}" cannot be resurrected, as it is still running or in the process of aborting.`,
			);

			return;
		}

		try {
			const result = await apifyClient.run(runId).resurrect();

			if (this.flags.json) {
				this.logger.stdout.json(result);
				return;
			}

			this.logger.stdout.success(`Run with ID "${runId}" was resurrected successfully.`);
		} catch (err) {
			const casted = err as ApifyApiError;

			this.logger.stdout.error(`Failed to resurrect run "${runId}".\n  ${casted.message || casted}`);
		}
	}
}
