import { ACTOR_JOB_STATUSES } from '@apify/consts';
import { Args, Flags } from '@oclif/core';
import type { ApifyApiError } from 'apify-client';

import { ApifyCommand } from '../../lib/apify_command.js';
import { error, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

const runningStatuses = [ACTOR_JOB_STATUSES.READY, ACTOR_JOB_STATUSES.RUNNING];

const abortingStatuses = [ACTOR_JOB_STATUSES.ABORTING, ACTOR_JOB_STATUSES.TIMING_OUT];

export class RunsAbortCommand extends ApifyCommand<typeof RunsAbortCommand> {
	static override description = 'Aborts an Actor Run.';

	static override args = {
		runId: Args.string({
			required: true,
			description: 'The run ID to abort.',
		}),
	};

	static override flags = {
		force: Flags.boolean({
			description: 'Whether to force the run to abort immediately, instead of gracefully.',
			default: false,
			char: 'f',
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { runId } = this.args;

		const apifyClient = await getLoggedClientOrThrow();

		const run = await apifyClient.run(runId).get();

		if (!run) {
			error({ message: `Run with ID "${runId}" was not found on your account.` });
			return;
		}

		if (!runningStatuses.includes(run.status as never)) {
			if (abortingStatuses.includes(run.status as never)) {
				error({ message: `Run with ID "${runId}" is already aborting.` });
			} else {
				error({ message: `Run with ID "${runId}" is already aborted.` });
			}

			return;
		}

		try {
			const result = await apifyClient.run(runId).abort({ gracefully: !this.flags.force });

			if (this.flags.json) {
				return result;
			}

			if (this.flags.force) {
				success({ message: `Triggered the immediate abort of run "${runId}".` });
			} else {
				success({
					message: `Triggered the abort of run "${runId}", it should be aborted in around 30 seconds.`,
				});
			}
		} catch (err) {
			const casted = err as ApifyApiError;

			error({
				message: `Failed to abort run "${runId}".\n  ${casted.message || casted}`,
			});
		}

		return undefined;
	}
}
