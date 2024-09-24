import process from 'node:process';

import { ACTOR_JOB_STATUSES } from '@apify/consts';
import { Args, Flags } from '@oclif/core';
import { type ActorStartOptions, type ApifyClient, type Dataset, DownloadItemsFormat } from 'apify-client';

import { ApifyCommand } from '../../lib/apify_command.js';
import { getInputOverride } from '../../lib/commands/resolve-input.js';
import { SharedRunOnCloudFlags, runActorOrTaskOnCloud } from '../../lib/commands/run-on-cloud.js';
import { LOCAL_CONFIG_PATH } from '../../lib/consts.js';
import { getLocalConfig, getLocalUserInfo, getLoggedClientOrThrow } from '../../lib/utils.js';

const TerminalStatuses = [
	ACTOR_JOB_STATUSES.SUCCEEDED,
	ACTOR_JOB_STATUSES.ABORTED,
	ACTOR_JOB_STATUSES.FAILED,
	ACTOR_JOB_STATUSES.TIMED_OUT,
];

export class ActorsCallCommand extends ApifyCommand<typeof ActorsCallCommand> {
	static override description =
		'Runs a specific Actor remotely on the Apify cloud platform.\n' +
		'The Actor is run under your current Apify account. Therefore you need to be logged in by calling "apify login". ' +
		'It takes input for the Actor from the default local key-value store by default.';

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
	};

	static override args = {
		actorId: Args.string({
			required: false,
			description:
				'Name or ID of the Actor to run (e.g. "my-actor", "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). ' +
				`If not provided, the command runs the remote Actor specified in the "${LOCAL_CONFIG_PATH}" file.`,
		}),
	};

	async run() {
		const cwd = process.cwd();
		const localConfig = getLocalConfig(cwd) || {};
		const apifyClient = await getLoggedClientOrThrow();
		const userInfo = await getLocalUserInfo();
		const usernameOrId = userInfo.username || (userInfo.id as string);

		const { id: actorId, userFriendlyId } = await ActorsCallCommand.resolveActorId({
			client: apifyClient,
			localActorName: localConfig.name as string | undefined,
			usernameOrId,
			providedActorNameOrId: this.args.actorId,
		});

		const runOpts: ActorStartOptions = {
			waitForFinish: 2, // NOTE: We need to wait some time to Apify open stream and we can create connection
		};

		const waitForFinishMillis = Number.isNaN(this.flags.waitForFinish)
			? undefined
			: Number.parseInt(this.flags.waitForFinish!, 10) * 1000;

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

		let run = await runActorOrTaskOnCloud(apifyClient, {
			actorOrTaskData: {
				id: actorId,
				userFriendlyId,
			},
			runOptions: runOpts,
			type: 'Actor',
			waitForFinishMillis,
			inputOverride: inputOverride?.input,
			silent: this.flags.silent,
		});

		if (this.flags.outputDataset) {
			// TODO: cleaner way to do this (aka move it to a util function, or integrate it into runActorOrTaskOnCloud)
			while (!TerminalStatuses.includes(run.status as never)) {
				run = (await apifyClient.run(run.id).get())!;

				if (TerminalStatuses.includes(run.status as never)) {
					break;
				}

				// Wait a second before checking again
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			const datasetId = run.defaultDatasetId;

			let info: Dataset;
			let retries = 5;

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
	}

	private static async resolveActorId({
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
			};
		}

		// Try fetching Actor directly by name/id
		if (providedActorNameOrId) {
			const actorById = await client.actor(providedActorNameOrId).get();

			if (actorById) {
				return {
					userFriendlyId: `${actorById.username}/${actorById.name}`,
					id: actorById.id,
				};
			}

			const actorByName = await client.actor(`${usernameOrId}/${providedActorNameOrId.toLowerCase()}`).get();

			if (actorByName) {
				return {
					userFriendlyId: `${actorByName.username}/${actorByName.name}`,
					id: actorByName.id,
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
			};
		}

		throw new Error(
			'Please provide an Actor ID or name, or run this command from a directory with a valid Apify Actor.',
		);
	}
}
