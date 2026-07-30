import type { ApifyApiError } from 'apify-client';

import { ACTOR_JOB_STATUSES } from '@apify/consts';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { error, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, printJsonToStdout } from '../../lib/utils.js';

const runningStatuses = [ACTOR_JOB_STATUSES.READY, ACTOR_JOB_STATUSES.RUNNING];

const abortingStatuses = [ACTOR_JOB_STATUSES.ABORTING, ACTOR_JOB_STATUSES.TIMING_OUT];

export class BuildsAbortCommand extends ApifyCommand<typeof BuildsAbortCommand> {
	static override name = 'abort' as const;

	static override description = 'Aborts an Actor build that is currently in progress.';

	static override examples = [
		{
			description: 'Abort a running Actor build.',
			command: 'apify builds abort <buildId>',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-builds-abort';

	static override args = {
		buildId: Args.string({
			required: true,
			description: 'The build ID to abort.',
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { buildId } = this.args;

		const apifyClient = await getLoggedClientOrThrow();

		const build = await apifyClient.build(buildId).get();

		if (!build) {
			error({ message: `Build with ID "${buildId}" was not found on your account.`, stdout: true });
			return;
		}

		if (!runningStatuses.includes(build.status as never)) {
			if (abortingStatuses.includes(build.status as never)) {
				error({ message: `Build with ID "${buildId}" is already aborting.`, stdout: true });
			} else if (build.status === ACTOR_JOB_STATUSES.ABORTED || build.status === ACTOR_JOB_STATUSES.TIMED_OUT) {
				error({ message: `Build with ID "${buildId}" is already aborted.`, stdout: true });
			} else {
				error({
					message: `Build with ID "${buildId}" cannot be aborted (status: ${build.status}).`,
					stdout: true,
				});
			}

			return;
		}

		try {
			const result = await apifyClient.build(buildId).abort();

			if (this.flags.json) {
				printJsonToStdout(result);
				return;
			}

			success({
				message: `Triggered the abort of build "${buildId}".`,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;

			error({
				message: `Failed to abort build "${buildId}".\n  ${casted.message || casted}`,
				stdout: true,
			});
		}
	}
}
