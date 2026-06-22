import process from 'node:process';

import type { Build } from 'apify-client';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import {
	consoleBuildUrl,
	exitCodeForWaitResult,
	fetchLogTail,
	formatResultSummary,
	waitForTerminalStatus,
} from '../../lib/commands/agent-output.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, printJsonToStdout } from '../../lib/utils.js';

export class BuildsWaitCommand extends ApifyCommand<typeof BuildsWaitCommand> {
	static override name = 'wait' as const;

	static override description =
		'Waits for an Actor build to reach a terminal status (SUCCEEDED, FAILED, ABORTED, TIMED-OUT).\n' +
		'Returns exit code 0 only when the build SUCCEEDED. Designed for CI and agentic workflows.';

	static override examples = [
		{
			description: 'Wait for a build to finish and return a non-zero exit code on failure.',
			command: 'apify builds wait <buildId>',
		},
		{
			description: 'Wait for a build and emit a structured JSON result.',
			command: 'apify builds wait <buildId> --json',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-builds-wait';

	static override enableJsonFlag = true;

	static override args = {
		buildId: Args.string({
			required: true,
			description: 'The build ID to wait for.',
		}),
	};

	static override flags = {
		timeout: Flags.integer({
			char: 't',
			description: 'In seconds, how long to wait before giving up. If skipped, it waits indefinitely.',
			required: false,
		}),
		'poll-interval': Flags.integer({
			description: 'In seconds, how often to poll the platform. Defaults to 2.',
			required: false,
		}),
	};

	async run() {
		const { buildId } = this.args;
		const { timeout, pollInterval, json } = this.flags;

		const apifyClient = await getLoggedClientOrThrow();

		const { job, timedOutWaiting } = await waitForTerminalStatus({
			apifyClient,
			jobId: buildId,
			kind: 'build',
			maxWaitMillis: timeout ? timeout * 1000 : undefined,
			pollIntervalMillis: pollInterval ? pollInterval * 1000 : undefined,
		});
		const build = job as Build;

		const url = consoleBuildUrl(build.actId, build.buildNumber);
		const ok = build.status === 'SUCCEEDED';
		const exitCode = exitCodeForWaitResult({ job, timedOutWaiting }, 'build');
		const giveUpMessage = `Gave up waiting after ${timeout}s; build is still ${build.status}`;

		let logTail: string[] = [];
		if (!ok) {
			logTail = await fetchLogTail(apifyClient, build.id);
		}

		if (json) {
			printJsonToStdout({
				ok,
				operation: 'builds.wait',
				timedOutWaiting,
				build: {
					id: build.id,
					status: build.status,
					number: build.buildNumber,
					url,
				},
				...(ok
					? {}
					: {
							error: {
								phase: 'build',
								message: timedOutWaiting ? giveUpMessage : 'Actor build did not succeed',
								logTail,
							},
						}),
				exitCode,
			});
			process.exitCode = exitCode;
			return;
		}

		const lines: { label: string; value: string }[] = [
			{ label: 'Build', value: build.status },
			{ label: 'Build ID', value: build.id },
			{ label: 'Build number', value: build.buildNumber },
			{ label: 'Actor ID', value: build.actId },
		];

		const links = [{ label: 'Build URL', url }];

		simpleLog({
			message: formatResultSummary({
				resultLabel: 'Apify build result',
				overallStatus: build.status as never,
				lines,
				links,
				errorReason: ok ? undefined : logTail,
			}),
			stdout: true,
		});

		if (timedOutWaiting) {
			error({ message: `${giveUpMessage}.` });
		} else if (!ok) {
			error({ message: `Build ended with status ${build.status}.` });
		}
		process.exitCode = exitCode;
	}
}
