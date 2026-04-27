import type { ApifyClient } from 'apify-client';
import chalk from 'chalk';

import { INTERRUPT_SIGNALS } from '../consts.js';
import { logger } from '../logger.js';
import { useSignalHandler } from './useSignalHandler.js';

export type UseAbortJobOnSignalInput = {
	/** Logged-in client used to issue the abort request. */
	apifyClient: ApifyClient;
	/** Suppress status output. The listener still fires — it just stays silent. Defaults to `false`. */
	silent?: boolean;
} & (
	| {
			/** Abort an Actor build. Builds have no graceful/force distinction. */
			kind: 'build';
			/** ID of the build to abort. */
			jobId: string;
	  }
	| {
			/** Abort an Actor or Task run. Runs escalate: graceful on the first signal, forced on the second. */
			kind: 'run';
			/** ID of the run to abort. */
			jobId: string;
			/** Used purely for the user-visible status line (e.g. "aborting actor run ..."). */
			runType: 'Actor' | 'Task';
	  }
);

/**
 * Registers a signal handler that aborts the given build or run on the Apify
 * platform, and returns a `Disposable` that removes it. Pair with the `using`
 * keyword so the listener is always cleaned up when the enclosing block
 * exits.
 *
 * Repeat signals never terminate the CLI while an abort is in flight — the
 * listener stays registered for the lifetime of the `using` binding:
 *
 * - For `kind: 'build'`, the first signal issues the abort and subsequent
 *   signals are silent no-ops. The build-abort API has no "gracefully" knob.
 * - For `kind: 'run'`, the first signal issues `abort({ gracefully: true })`
 *   with a hint that pressing Ctrl+C again forces an immediate abort. The
 *   second signal issues `abort({ gracefully: false })`. Third and later
 *   signals are silent no-ops.
 *
 * @example
 * ```ts
 * {
 *   using _signalHandler = useAbortJobOnSignal({
 *     apifyClient: client,
 *     kind: 'build',
 *     jobId: build.id,
 *   });
 *
 *   await outputJobLog({ job: build, apifyClient: client });
 * } // listener is removed here
 * ```
 */
export function useAbortJobOnSignal(input: UseAbortJobOnSignalInput): Disposable {
	const { apifyClient, silent = false } = input;

	let abortAttempt = 0;

	return useSignalHandler({
		signals: INTERRUPT_SIGNALS,
		once: false,
		handler: async (signal) => {
			abortAttempt += 1;

			if (input.kind === 'build') {
				if (abortAttempt > 1) {
					return;
				}

				if (!silent) {
					logger.stdout.info(
						chalk.gray(
							`Received ${chalk.yellow(signal)}, aborting build "${chalk.yellow(input.jobId)}" on the Apify platform...`,
						),
					);
				}

				try {
					await apifyClient.build(input.jobId).abort();
				} catch (abortErr) {
					logger.stdout.error(`Failed to abort build "${input.jobId}": ${(abortErr as Error).message}`);
				}

				return;
			}

			if (abortAttempt > 2) {
				return;
			}

			const gracefully = abortAttempt === 1;
			const runLabel = `${input.runType.toLowerCase()} run`;

			if (!silent) {
				const message = gracefully
					? `Received ${chalk.yellow(signal)}, gracefully aborting ${runLabel} "${chalk.yellow(input.jobId)}" on the Apify platform... ${chalk.dim('(press Ctrl+C again to abort immediately)')}`
					: `Received ${chalk.yellow(signal)} again, aborting ${runLabel} "${chalk.yellow(input.jobId)}" immediately...`;

				logger.stdout.info(chalk.gray(message));
			}

			try {
				await apifyClient.run(input.jobId).abort({ gracefully });
			} catch (abortErr) {
				logger.stdout.error(`Failed to abort run "${input.jobId}": ${(abortErr as Error).message}`);
			}
		},
	});
}
