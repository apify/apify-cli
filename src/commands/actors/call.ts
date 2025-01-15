import process from 'node:process';

import { Args, Flags } from '@oclif/core';
import {
	type ActorRun,
	type ActorStartOptions,
	type ActorTaggedBuild,
	type ApifyClient,
	type Dataset,
	DownloadItemsFormat,
} from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/apify_command.js';
import { getInputOverride } from '../../lib/commands/resolve-input.js';
import { SharedRunOnCloudFlags, runActorOrTaskOnCloud } from '../../lib/commands/run-on-cloud.js';
import { CommandExitCodes, LOCAL_CONFIG_PATH } from '../../lib/consts.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLocalConfig, getLocalUserInfo, getLoggedClientOrThrow, TimestampFormatter } from '../../lib/utils.js';

export class ActorsCallCommand extends ApifyCommand<typeof ActorsCallCommand> {
	static override description =
		'Executes Actor remotely using your authenticated account.\n' +
		'Reads input from local key-value store by default.';

	static override flags = {
		...SharedRunOnCloudFlags('Actor'),
		input: Flags.string({
			char: 'i',
			description: 'Optional JSON input to be given to the Actor.',
			required: false,
			allowStdin: true,
			exclusive: ['input-file'],
		}),
		'input-file': Flags.string({
			aliases: ['if'],
			description:
				'Optional path to a file with JSON input to be given to the Actor. The file must be a valid JSON file. You can also specify `-` to read from standard input.',
			required: false,
			allowStdin: true,
			exclusive: ['input'],
		}),
		silent: Flags.boolean({
			char: 's',
			description: 'Prevents printing the logs of the Actor run to the console.',
			default: false,
		}),
		'output-dataset': Flags.boolean({
			char: 'o',
			description: 'Prints out the entire default dataset on successful run of the Actor.',
		}),
		// TODO: do we want to do the --stream-x flags? Can we even do them?
	};

	static override enableJsonFlag = true;

	static override args = {
		actorId: Args.string({
			required: false,
			description:
				'Name or ID of the Actor to run (e.g. "my-actor", "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). ' +
				`If not provided, the command runs the remote Actor specified in the '${LOCAL_CONFIG_PATH}' file.`,
		}),
	};

	async run() {
		const cwd = process.cwd();
		const localConfig = getLocalConfig(cwd) || {};
		const apifyClient = await getLoggedClientOrThrow();
		const userInfo = await getLocalUserInfo();
		const usernameOrId = userInfo.username || (userInfo.id as string);

		if (this.flags.json && this.flags.outputDataset) {
			error({ message: 'You cannot use both the --json and --output-dataset flags when running this command.' });
			process.exitCode = CommandExitCodes.InvalidInput;

			return;
		}

		const {
			id: actorId,
			userFriendlyId,
			actorData,
		} = await ActorsCallCommand.resolveActorId({
			client: apifyClient,
			localActorName: localConfig.name as string | undefined,
			usernameOrId,
			providedActorNameOrId: this.args.actorId,
		});

		const runOpts: ActorStartOptions = {
			waitForFinish: 2, // NOTE: We need to wait some time to Apify open stream and we can create connection
		};

		if (this.flags.build) {
			runOpts.build = this.flags.build;
		}

		if (this.flags.timeout) {
			runOpts.timeout = this.flags.timeout;
		}

		if (this.flags.memory) {
			runOpts.memory = this.flags.memory;
		}

		const inputOverride = await getInputOverride(cwd, this.flags.input, this.flags.inputFile);

		// Means we couldn't resolve input, so we should exit
		if (inputOverride === false) {
			return;
		}

		let runStarted = false;
		let run: ActorRun;

		let url: string;
		let datasetUrl: string;

		const iterator = runActorOrTaskOnCloud(apifyClient, {
			actorOrTaskData: {
				id: actorId,
				userFriendlyId,
			},
			runOptions: runOpts,
			type: 'Actor',
			inputOverride: inputOverride?.input,
			silent: this.flags.silent,
			waitForRunToFinish: true,
			printRunLogs: true,
		});

		for await (const yieldedRun of iterator) {
			run = yieldedRun;

			if (!runStarted) {
				runStarted = true;

				// A *lot* is copied from `runs info`
				if (!this.flags.silent) {
					url = `https://console.apify.com/actors/${actorId}/runs/${yieldedRun.id}`;
					datasetUrl = `https://console.apify.com/storage/datasets/${yieldedRun.defaultDatasetId}`;

					const message: string[] = [
						`${chalk.yellow('Started')}: ${TimestampFormatter.display(yieldedRun.startedAt)}`,
					];

					// container url
					if (yieldedRun.containerUrl) {
						message.push(`${chalk.yellow('Container URL')}: ${chalk.blue(yieldedRun.containerUrl)}`);
					}

					// basic version info

					const expectedActorVersion = run.buildNumber.split('.').slice(0, 2).join('.');

					const actorVersion = actorData.versions.find((item) => item.versionNumber === expectedActorVersion);

					const runVersionTaggedAs = Object.entries(
						(actorData.taggedBuilds ?? {}) as Record<string, ActorTaggedBuild>,
					).find(([, data]) => data.buildNumber === yieldedRun.buildNumber)?.[0];

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

					// timeout
					message.push(
						`${chalk.yellow('Timeout')}: ${run.options.timeoutSecs.toLocaleString('en-US')} seconds`,
					);

					// memory limit
					message.push(`${chalk.yellow('Memory')}: ${run.options.memoryMbytes} MB`);

					// url
					message.push(`${chalk.blue('View on Apify Console')}: ${url}`, '');

					simpleLog({ message: message.join('\n'), stdout: true });
				}
			}
		}

		if (this.flags.json) {
			return run!;
		}

		if (!this.flags.silent) {
			simpleLog({
				message: [
					'',
					`${chalk.blue('Export results')}: ${datasetUrl!}`,
					`${chalk.blue('View on Apify Console')}: ${url!}`,
				].join('\n'),
				stdout: true,
			});
		}

		if (this.flags.outputDataset) {
			const datasetId = run!.defaultDatasetId;

			let info: Dataset;
			let retries = 4;

			// Why is this needed? Sometimes, when fetching the dataset info right after the run ends, the object doesn't have the stats up-to-date.
			// But sometimes it does!
			do {
				info = (await apifyClient.dataset(datasetId).get())!;

				if (info?.itemCount) {
					break;
				}

				await new Promise((resolve) => setTimeout(resolve, 250));
			} while (retries--);

			const dataset = await apifyClient.dataset(datasetId).downloadItems(DownloadItemsFormat.JSON, {
				clean: true,
			});

			console.log(dataset.toString());
		}

		return undefined;
	}

	static async resolveActorId({
		client,
		localActorName,
		usernameOrId,
		providedActorNameOrId,
	}: {
		client: ApifyClient;
		localActorName: string | undefined;
		usernameOrId: string;
		providedActorNameOrId?: string;
	}) {
		// Full ID
		if (providedActorNameOrId?.includes('/')) {
			const actor = await client.actor(providedActorNameOrId).get();
			if (!actor) {
				throw new Error(`Cannot find Actor with ID '${providedActorNameOrId}' in your account.`);
			}

			return {
				userFriendlyId: `${actor.username}/${actor.name}`,
				id: actor.id,
				actorData: actor,
			};
		}

		// Try fetching Actor directly by name/id
		if (providedActorNameOrId) {
			const actorById = await client.actor(providedActorNameOrId).get();

			if (actorById) {
				return {
					userFriendlyId: `${actorById.username}/${actorById.name}`,
					id: actorById.id,
					actorData: actorById,
				};
			}

			const actorByName = await client.actor(`${usernameOrId}/${providedActorNameOrId.toLowerCase()}`).get();

			if (actorByName) {
				return {
					userFriendlyId: `${actorByName.username}/${actorByName.name}`,
					id: actorByName.id,
					actorData: actorByName,
				};
			}

			throw new Error(`Cannot find Actor with name or ID '${providedActorNameOrId}' in your account.`);
		}

		if (localActorName) {
			const actor = await client.actor(`${usernameOrId}/${localActorName}`).get();

			if (!actor) {
				throw new Error(
					`Cannot find Actor with ID '${usernameOrId}/${localActorName}' ` +
						'in your account. Call "apify push" to push this Actor to Apify platform.',
				);
			}

			return {
				userFriendlyId: `${actor.username}/${actor.name}`,
				id: actor.id,
				actorData: actor,
			};
		}

		throw new Error(
			'Please provide an Actor ID or name, or run this command from a directory with a valid Apify Actor.',
		);
	}
}
