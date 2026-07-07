import process from 'node:process';

import chalk from 'chalk';

import { ACTOR_JOB_TYPES } from '@apify/consts';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import {
	consoleBuildUrl,
	exitCodeForJobStatus,
	fetchLogTail,
	formatResultSummary,
	waitForTerminalStatus,
} from '../../lib/commands/agent-output.js';
import { resolveActorContext } from '../../lib/commands/resolve-actor-context.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { useAbortJobOnSignal } from '../../lib/hooks/useAbortJobOnSignal.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, objectGroupBy, outputJobLog, printJsonToStdout } from '../../lib/utils.js';

export class BuildsCreateCommand extends ApifyCommand<typeof BuildsCreateCommand> {
	static override name = 'create' as const;

	static override description = 'Creates a new build of the Actor.';

	static override examples = [
		{
			description: 'Build the Actor in the current directory with the default "latest" tag.',
			command: 'apify builds create',
		},
		{
			description: 'Build a specific Actor with a custom tag and stream the build log.',
			command: 'apify builds create apify/hello-world --tag beta --log',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-builds-create';

	static override flags = {
		tag: Flags.string({
			description: 'Build tag to be applied to the successful Actor build. By default, this is "latest".',
		}),
		version: Flags.string({
			description:
				'Optional Actor Version to build. By default, this will be inferred from the tag, but this flag is required when multiple versions have the same tag.',
			required: false,
		}),
		log: Flags.boolean({
			description: 'Whether to print out the build log after the build is triggered.',
		}),
		wait: Flags.boolean({
			description: 'Wait for the build to reach a terminal status. Returns exit code 0 only when the build SUCCEEDED.',
			default: false,
		}),
	};

	static override args = {
		actorId: Args.string({
			description:
				'Optional Actor ID or Name to trigger a build for. By default, it will use the Actor from the current directory.',
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { tag, version, json, log, wait } = this.flags;
		const { actorId } = this.args;

		if (log && wait) {
			error({
				message:
					'The --log and --wait flags cannot be used together. --log already waits for the build to finish while streaming its log.',
			});
			process.exitCode = CommandExitCodes.InvalidInput;

			return;
		}

		const client = await getLoggedClientOrThrow();

		const ctx = await resolveActorContext({ providedActorNameOrId: actorId, client });

		if (!ctx.valid) {
			error({
				message: `${ctx.reason}. Please run this command in an Actor directory, or specify the Actor ID.`,
				stdout: true,
			});

			return;
		}

		const actorInfo = (await client.actor(ctx.id).get())!;

		const versionsByBuildTag = objectGroupBy(actorInfo.versions, (actorVersion) => actorVersion.buildTag ?? 'latest');

		const taggedVersions = versionsByBuildTag[tag ?? 'latest'];
		const specificVersionExists = actorInfo.versions.find((v) => v.versionNumber === version);

		let selectedVersion: string | undefined;

		// --version takes precedence over tagged versions (but if --tag is also specified, it will be checked again)
		if (specificVersionExists) {
			// The API doesn't really care if the tag you use for a version is correct or not, just that the version exists. This means you CAN have two separate versions with the same tag
			// but only the latest one that gets built will have the tag.
			// The *console* lets you pick a version to build. Multiple versions can have the same default tag, ergo what was written above.
			// The API *does* also let you tag any existing version with whatever you want. This is where we diverge, and follow semi-console-like behavior. Effectively, this one if check prevents you from doing
			// "--version 0.1 --tag not_actually_the_tag", even if that is technically perfectly valid. Future reader of this code, if this is not wanted, nuke the if check.

			// This ensures that a --tag and --version match the version and tag the platform knows about
			// but only when --tag is provided
			if (tag && (!taggedVersions || !taggedVersions.some((v) => v.versionNumber === version))) {
				error({
					message: `The Actor Version "${version}" does not have the tag "${tag}".`,
					stdout: true,
				});

				return;
			}

			selectedVersion = version!;
		} else if (taggedVersions) {
			selectedVersion = taggedVersions[0].versionNumber!;

			if (taggedVersions.length > 1) {
				if (!version) {
					error({
						message: `Multiple Actor versions with the tag "${tag}" found. Please specify the version number using the "--version" flag.\n  Available versions for this tag: ${taggedVersions.map((v) => chalk.yellow(v.versionNumber)).join(', ')}`,
						stdout: true,
					});

					return;
				}

				// On second run, it will call the upper if check
			}
		}

		if (!selectedVersion) {
			error({
				message: `No Actor versions with the tag "${tag}" found. You can push a new version with this tag by using "apify push --build-tag=${tag}".`,
				stdout: true,
			});

			return;
		}

		let build = await client.actor(ctx.id).build(selectedVersion, { tag });

		const actorName = actorInfo?.name ?? 'unknown-actor';
		const url = consoleBuildUrl(build.actId, build.buildNumber);

		if (log || wait) {
			// Forward interrupt signals to a platform-side abort so the build
			// doesn't keep running after the user gives up waiting (Ctrl+C,
			// SIGTERM from a parent process, SIGHUP from a closing terminal).
			// The `using` binding removes the listener when the block exits.
			using _signalHandler = useAbortJobOnSignal({
				apifyClient: client,
				kind: ACTOR_JOB_TYPES.BUILD,
				jobId: build.id,
			});

			if (log) {
				try {
					await outputJobLog({ job: build, apifyClient: client });
				} catch (err) {
					// This should never happen...
					error({
						message: `Failed to print log for build with ID "${build.id}": ${(err as Error).message}`,
						stdout: true,
					});
				}
			}

			// The log stream (or wait) can return before the build is terminal
			// (closed early, connection dropped). Poll to a terminal status so the
			// outcome below isn't mislabeled as a failure while still running.
			const { job } = await waitForTerminalStatus({
				apifyClient: client,
				jobId: build.id,
				kind: ACTOR_JOB_TYPES.BUILD,
			});
			build = job as typeof build;
		}

		const reachedTerminal = log || wait;

		if (reachedTerminal) {
			const ok = build.status === 'SUCCEEDED';
			const exitCode = exitCodeForJobStatus(build.status, ACTOR_JOB_TYPES.BUILD);
			const logTail = ok ? [] : await fetchLogTail(client, build.id);

			if (json) {
				printJsonToStdout({
					ok,
					operation: 'builds.create',
					waited: true,
					actor: {
						id: build.actId,
						name: actorName,
					},
					build: {
						id: build.id,
						number: build.buildNumber,
						status: build.status,
						url,
					},
					...(ok
						? {}
						: {
								error: {
									phase: 'build',
									message: 'Actor build did not succeed',
									logTail,
								},
							}),
					exitCode,
				});
				process.exitCode = exitCode;
				return;
			}

			simpleLog({
				message: formatResultSummary({
					resultLabel: 'Apify build result',
					overallStatus: build.status as never,
					lines: [
						{ label: 'Build', value: build.status },
						{ label: 'Build ID', value: build.id },
						{ label: 'Build number', value: build.buildNumber },
						{ label: 'Actor ID', value: build.actId },
					],
					links: [{ label: 'Build URL', url }],
					errorReason: ok ? undefined : logTail,
				}),
				stdout: true,
			});

			process.exitCode = exitCode;
			return;
		}

		// Async path (no --wait, no --log)
		if (json) {
			printJsonToStdout({
				ok: true,
				operation: 'builds.create',
				waited: false,
				actor: {
					id: build.actId,
					name: actorName,
				},
				build: {
					id: build.id,
					number: build.buildNumber,
					status: build.status,
					url,
				},
				next: {
					wait: `apify builds wait ${build.id} --json`,
					log: `apify builds log ${build.id}`,
					info: `apify builds info ${build.id} --json`,
				},
				exitCode: 0,
			});
			return;
		}

		const message: string[] = [
			chalk.greenBright('Build started.'),
			'',
			`${chalk.yellow('Actor')}: ${actorName} (${chalk.gray(build.actId)})`,
			`${chalk.yellow('Build ID')}: ${build.id}`,
			`${chalk.yellow('Build number')}: ${build.buildNumber}`,
			`${chalk.yellow('Status')}: ${build.status}`,
			'',
			chalk.gray('This command does not wait for the build to finish.'),
			'',
			'To wait for the final status:',
			`  apify builds wait ${build.id} --json`,
			'',
			'To inspect logs:',
			`  apify builds log ${build.id}`,
			'',
			'To inspect build metadata:',
			`  apify builds info ${build.id} --json`,
		];

		simpleLog({
			message: message.join('\n'),
			stdout: true,
		});
	}
}
