import { Args, Flags } from '@oclif/core';
import type { ActorRun, ActorRunUsage, ActorTaggedBuild } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/apify_command.js';
import { prettyPrintBytes } from '../../lib/commands/pretty-print-bytes.js';
import { prettyPrintStatus } from '../../lib/commands/pretty-print-status.js';
import { ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, ShortDurationFormatter, TimestampFormatter } from '../../lib/utils.js';

const usageTable = new ResponsiveTable({
	allColumns: ['', 'Unit', 'USD Amount'],
	mandatoryColumns: ['', 'Unit', 'USD Amount'],
	columnAlignments: {
		Unit: 'right',
		'USD Amount': 'right',
	},
});

const usageMapping: Record<string, keyof ActorRunUsage> = {
	'Actor compute units': 'ACTOR_COMPUTE_UNITS',
	'Dataset reads': 'DATASET_READS',
	'Dataset writes': 'DATASET_WRITES',
	'Key-value store reads': 'KEY_VALUE_STORE_READS',
	'Key-value store writes': 'KEY_VALUE_STORE_WRITES',
	'Key-value store lists': 'KEY_VALUE_STORE_LISTS',
	'Request queue reads': 'REQUEST_QUEUE_READS',
	'Request queue writes': 'REQUEST_QUEUE_WRITES',
	'Data transfer internal': 'DATA_TRANSFER_INTERNAL_GBYTES',
	'Data transfer external': 'DATA_TRANSFER_EXTERNAL_GBYTES',
	'Proxy residential data transfer': 'PROXY_RESIDENTIAL_TRANSFER_GBYTES',
	'Proxy SERPs': 'PROXY_SERPS',
};

export class RunsInfoCommand extends ApifyCommand<typeof RunsInfoCommand> {
	static override description = 'Prints information about an Actor Run.';

	static override args = {
		runId: Args.string({
			required: true,
			description: 'The run ID to print information about.',
		}),
	};

	static override flags = {
		verbose: Flags.boolean({
			char: 'v',
			description: 'Prints more in-depth information about the Actor Run.',
			default: false,
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

		// Not ideal but we need to fetch the actor, build and task after fetching the run
		const [actor, build, task, defaultDataset, defaultRequestQueue] = await Promise.all([
			apifyClient.actor(run.actId).get(),
			apifyClient.build(run.buildId).get(),
			run.actorTaskId ? apifyClient.task(run.actorTaskId).get() : Promise.resolve(undefined),
			apifyClient.dataset(run.defaultDatasetId).get(),
			apifyClient.requestQueue(run.defaultRequestQueueId).get(),
		]);

		if (this.flags.json) {
			return {
				...run,
				actor,
				build,
				task,
				defaultDataset,
				defaultRequestQueue,
			};
		}

		this.addDetailedUsage(run);

		const fullActorName = actor?.username ? `${actor.username}/${actor.name}` : (actor?.name ?? 'unknown-actor');

		const message: string[] = [
			//
			`${chalk.yellow('Actor')}: ${fullActorName} (${chalk.grey(run.actId)})`,
		];

		// Handle task
		if (task) {
			message.push(`└─ ${chalk.yellow('Task')}: ${task.title ?? task.name} (${chalk.gray(run.actorTaskId)})`, '');
		} else if (run.actorTaskId) {
			message.push(`└─ ${chalk.yellow('Task')}: unknown-task (${chalk.gray(run.actorTaskId)})`, '');
		} else {
			message.push('');
		}

		// basic info (results, requests, usage, started, duration, container url, origin, start date, etc)

		// status
		const exitCodeStatus = ` (exit code: ${chalk.gray(run.exitCode !== null ? run.exitCode : 'N/A')})`;
		message.push(`${chalk.yellow('Status')}: ${prettyPrintStatus(run.status)}${exitCodeStatus}`);

		if (run.statusMessage) {
			message.push(`└─ ${chalk.yellow('Status Message:')} ${run.statusMessage}`);
		}

		// results
		const resultCount = defaultDataset?.itemCount ?? 0;
		message.push(`${chalk.yellow('Results')}: ${chalk.cyan(resultCount.toLocaleString('en-US'))}`);

		// requests
		if (defaultRequestQueue) {
			message.push(
				`${chalk.yellow('Requests')}: ${chalk.cyan(defaultRequestQueue.handledRequestCount.toLocaleString('en-US'))} out of ${chalk.cyan(defaultRequestQueue.totalRequestCount.toLocaleString('en-US'))} handled`,
			);
		} else {
			message.push(`${chalk.yellow('Requests')}: ${chalk.gray('unknown handled')}`);
		}

		// usage
		const renderedTip = this.flags.verbose
			? ''
			: chalk.gray(` (run with ${chalk.yellow('--verbose')} for a detailed breakdown)`);
		if (run.usageTotalUsd) {
			message.push(`${chalk.yellow('Usage')}: ${chalk.cyan(this.formatUsd(run.usageTotalUsd))}${renderedTip}`);
		} else {
			// If we somehow don't know this... oof
			message.push(`${chalk.yellow('Usage')}: $${chalk.gray('0.000')}${renderedTip}`);
		}

		// Verbose breakdown of costs
		if (this.flags.verbose) {
			// Always shown as compact because it looks much better
			message.push(usageTable.render(true));
		}

		// Separator
		message.push('');

		// time
		message.push(`${chalk.yellow('Started')}: ${TimestampFormatter.display(run.startedAt)}`);

		if (run.finishedAt) {
			message.push(
				`${chalk.yellow('Finished')}: ${TimestampFormatter.display(run.finishedAt)} (took ${chalk.gray(ShortDurationFormatter.format(run.stats.durationMillis))})`,
			);
		} else {
			const diff = Date.now() - run.startedAt.getTime();
			message.push(
				`${chalk.yellow('Finished')}: ${chalk.gray(`Running for ${ShortDurationFormatter.format(diff)}`)}`,
			);
		}

		// Separator
		message.push('');

		// resurrect, container url, origin, and run options (build, timeout, memory)
		if (run.stats.resurrectCount) {
			message.push(
				`${chalk.yellow('Resurrected')}: Yes, ${chalk.cyan(run.stats.resurrectCount.toLocaleString('en-US'))} ${this.pluralString(run.stats.resurrectCount, 'time', 'times')}`,
			);
		} else {
			message.push(`${chalk.yellow('Resurrected')}: No`);
		}

		// container
		message.push(`${chalk.yellow('Container URL')}: ${chalk.blue(run.containerUrl)}`);

		// origin
		message.push(`${chalk.yellow('Origin')}: ${run.meta.origin}`);

		// build
		if (actor && build) {
			// Compute detailed view
			const expectedVersion = run.buildNumber.split('.').slice(0, 2).join('.');

			const actorVersion = actor.versions.find((item) => item.versionNumber === expectedVersion);

			const runVersionTaggedAs = Object.entries<ActorTaggedBuild>(
				(actor.taggedBuilds ?? {}) as Record<string, ActorTaggedBuild>,
			).find(([, data]) => data.buildNumber === run.buildNumber)?.[0];

			const messageParts = [`${chalk.yellow('Build')}:`, chalk.cyan(run.buildNumber)];

			if (runVersionTaggedAs) {
				messageParts.push(`(${chalk.yellow(runVersionTaggedAs)})`);
			} else {
				messageParts.push(`(${chalk.gray('N/A')})`);
			}

			if (actorVersion) {
				messageParts.push(
					`| ${chalk.gray('Actor version:')} ${chalk.cyan(actorVersion.versionNumber)} (${chalk.yellow(actorVersion.buildTag)})`,
				);
			}

			message.push(messageParts.join(' '));
		} else {
			message.push(`${chalk.yellow('Build')}: ${chalk.cyan(run.buildNumber)}`);
		}

		// timeout
		message.push(`${chalk.yellow('Timeout')}: ${run.options.timeoutSecs.toLocaleString('en-US')} seconds`);

		// memory limit
		message.push(`${chalk.yellow('Memory')}: ${run.options.memoryMbytes} MB`);

		// Separator
		message.push('');

		// CPU avg/max

		message.push(
			`${chalk.yellow('CPU')}: ${chalk.gray('Average:')} ${run.stats.cpuAvgUsage.toFixed(2)}% | ${chalk.gray('Maximum:')} ${run.stats.cpuMaxUsage.toFixed(2)}%`,
		);

		// memory avg/max

		message.push(
			`${chalk.yellow('Memory')}: ${chalk.gray('Average:')} ${prettyPrintBytes(run.stats.memAvgBytes, true)} | ${chalk.gray('Maximum:')} ${prettyPrintBytes(run.stats.memMaxBytes, true)}`,
		);

		simpleLog({ message: message.join('\n') });

		return undefined;
	}

	private addDetailedUsage(run: ActorRun) {
		const { usage, usageUsd } = run;

		if (!usage || !usageUsd) {
			for (const userFriendlyString of Object.keys(usageMapping)) {
				usageTable.pushRow({
					'': userFriendlyString,
					'Unit': 'N/A',
					'USD Amount': 'N/A',
				});
			}

			return;
		}

		for (const [userFriendlyString, property] of Object.entries(usageMapping)) {
			const usageNumber = usage[property] ?? 0;
			const usdAmount = usageUsd[property] ?? 0;

			switch (property) {
				case 'ACTOR_COMPUTE_UNITS': {
					usageTable.pushRow({
						'': userFriendlyString,
						Unit: usageNumber.toFixed(4),
						'USD Amount': this.formatUsd(usdAmount),
					});

					break;
				}

				case 'DATA_TRANSFER_INTERNAL_GBYTES':
				case 'DATA_TRANSFER_EXTERNAL_GBYTES':
				case 'PROXY_RESIDENTIAL_TRANSFER_GBYTES': {
					usageTable.pushRow({
						'': userFriendlyString,
						// Convert from GB to B (more verbose than console)
						Unit: prettyPrintBytes(usageNumber * 1024 * 1024 * 1024, true),
						'USD Amount': this.formatUsd(usdAmount),
					});

					break;
				}

				default: {
					usageTable.pushRow({
						'': userFriendlyString,
						Unit: usageNumber.toLocaleString('en-US'),
						'USD Amount': this.formatUsd(usdAmount),
					});
				}
			}
		}
	}

	private formatUsd(val: number) {
		return `$${val.toFixed(3)}`;
	}
}
