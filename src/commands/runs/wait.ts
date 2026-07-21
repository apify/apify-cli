import process from 'node:process';

import { ACTOR_JOB_STATUSES, ACTOR_JOB_TYPES } from '@apify/consts';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import {
	consoleRunUrl,
	exitCodeForWaitResult,
	fetchLogTail,
	formatResultSummary,
	waitForTerminalStatus,
} from '../../lib/commands/agent-output.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, printJsonToStdout } from '../../lib/utils.js';

export class RunsWaitCommand extends ApifyCommand<typeof RunsWaitCommand> {
	static override name = 'wait' as const;

	static override description =
		'Waits for an Actor run to reach a terminal status (SUCCEEDED, FAILED, ABORTED, TIMED-OUT).\n' +
		'Returns exit code 0 only when the run SUCCEEDED. Designed for CI and agentic workflows.';

	static override examples = [
		{
			description: 'Wait for a run to finish and return a non-zero exit code on failure.',
			command: 'apify runs wait <runId>',
		},
		{
			description: 'Wait for a run and emit a structured JSON result.',
			command: 'apify runs wait <runId> --json',
		},
		{
			description:
				'Give up waiting after 5 minutes. Reports the real current status and exits with code 6 if the run is still running.',
			command: 'apify runs wait <runId> --timeout 300',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-runs-wait';

	static override enableJsonFlag = true;

	static override args = {
		runId: Args.string({
			required: true,
			description: 'The run ID to wait for.',
		}),
	};

	static override flags = {
		timeout: Flags.integer({
			char: 't',
			description: 'Maximum seconds to wait before giving up. Without this flag the command waits indefinitely.',
			required: false,
		}),
		'poll-interval': Flags.integer({
			description: 'How often to poll the platform, in seconds. Defaults to 2.',
			required: false,
		}),
	};

	async run() {
		const { runId } = this.args;
		const { timeout, pollInterval, json } = this.flags;

		const apifyClient = await getLoggedClientOrThrow();

		const { job, timedOutWaiting } = await waitForTerminalStatus({
			apifyClient,
			jobId: runId,
			kind: ACTOR_JOB_TYPES.RUN,
			maxWaitMillis: timeout ? timeout * 1000 : undefined,
			pollIntervalMillis: pollInterval ? pollInterval * 1000 : undefined,
		});
		const run = job;

		const url = consoleRunUrl(run.actId, run.id);
		const ok = run.status === ACTOR_JOB_STATUSES.SUCCEEDED;
		const exitCode = exitCodeForWaitResult({ job, timedOutWaiting }, ACTOR_JOB_TYPES.RUN);
		const giveUpMessage = `Gave up waiting after ${timeout}s; run is still ${run.status}`;

		let logTail: string[] = [];
		if (!ok) {
			logTail = await fetchLogTail(apifyClient, run.id);
		}

		if (json) {
			printJsonToStdout({
				ok,
				operation: 'runs.wait',
				timedOutWaiting,
				run: {
					id: run.id,
					status: run.status,
					exitCode: run.exitCode ?? null,
					url,
				},
				...(ok
					? {}
					: {
							error: {
								phase: 'run',
								message: timedOutWaiting ? giveUpMessage : 'Actor run did not succeed',
								logTail,
							},
						}),
				exitCode,
			});
			process.exitCode = exitCode;
			return;
		}

		const lines: { label: string; value: string }[] = [
			{ label: 'Run', value: run.status },
			{ label: 'Run ID', value: run.id },
			{ label: 'Actor ID', value: run.actId },
		];

		if (run.buildNumber) {
			lines.push({ label: 'Build number', value: run.buildNumber });
		}

		if (typeof run.exitCode === 'number') {
			lines.push({ label: 'Exit code', value: String(run.exitCode) });
		}

		const links = [{ label: 'Run URL', url }];

		simpleLog({
			message: formatResultSummary({
				resultLabel: 'Apify run result',
				overallStatus: run.status,
				lines,
				links,
				errorReason: ok ? undefined : logTail,
			}),
			stdout: true,
		});

		if (timedOutWaiting) {
			error({ message: `${giveUpMessage}.` });
		} else if (!ok) {
			error({ message: `Run ended with status ${run.status}.` });
		}
		process.exitCode = exitCode;
	}
}
