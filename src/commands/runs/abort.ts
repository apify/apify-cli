import type { ApifyApiError } from 'apify-client';

import { ACTOR_JOB_STATUSES } from '@apify/consts';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

const runningStatuses = [ACTOR_JOB_STATUSES.READY, ACTOR_JOB_STATUSES.RUNNING];

const abortingStatuses = [ACTOR_JOB_STATUSES.ABORTING, ACTOR_JOB_STATUSES.TIMING_OUT];

export class RunsAbortCommand extends ApifyCommand<typeof RunsAbortCommand> {
	static override name = 'abort' as const;

	static override description = 'Aborts an Actor run.';

	static override examples = [
		{
			description: 'Abort a running Actor gracefully (up to 30s drain).',
			command: 'apify runs abort <runId>',
		},
		{
			description: 'Force-abort a running Actor immediately.',
			command: 'apify runs abort <runId> --force',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-runs-abort';

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
			this.logger.stdout.error(`Run with ID "${runId}" was not found on your account.`);
			return;
		}

		if (!runningStatuses.includes(run.status as never)) {
			if (abortingStatuses.includes(run.status as never)) {
				this.logger.stdout.error(`Run with ID "${runId}" is already aborting.`);
			} else {
				this.logger.stdout.error(`Run with ID "${runId}" is already aborted.`);
			}

			return;
		}

		try {
			const result = await apifyClient.run(runId).abort({ gracefully: !this.flags.force });

			if (this.flags.json) {
				this.logger.stdout.json(result);
				return;
			}

			if (this.flags.force) {
				this.logger.stdout.success(`Triggered the immediate abort of run "${runId}".`);
			} else {
				this.logger.stdout.success(
					`Triggered the abort of run "${runId}", it should finish aborting in up to 30 seconds.`,
				);
			}
		} catch (err) {
			const casted = err as ApifyApiError;

			this.logger.stdout.error(`Failed to abort run "${runId}".\n  ${casted.message || casted}`);
		}
	}
}
