import { Args, Flags } from '@oclif/core';
import type { ActorRun, ActorStartOptions, ActorTaggedBuild } from 'apify-client';
import chalk from 'chalk';

import { ActorsCallCommand } from './call.js';
import { ApifyCommand } from '../../lib/apify_command.js';
import { getInputOverride } from '../../lib/commands/resolve-input.js';
import { runActorOrTaskOnCloud, SharedRunOnCloudFlags } from '../../lib/commands/run-on-cloud.js';
import { LOCAL_CONFIG_PATH } from '../../lib/consts.js';
import { simpleLog } from '../../lib/outputs.js';
import { getLocalConfig, getLocalUserInfo, getLoggedClientOrThrow, TimestampFormatter } from '../../lib/utils.js';

export class ActorsStartCommand extends ApifyCommand<typeof ActorsStartCommand> {
	static override description =
		'Requires login.\n' +
		'Starts Actor remotely and returns run details immediately.\n' +
		'Uses authenticated account and local key-value store for input.';

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

		const runOpts: ActorStartOptions = {};

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

		if (inputOverride === false) {
			// Means we couldn't resolve input, so we should exit
			return;
		}

		const iterator = runActorOrTaskOnCloud(apifyClient, {
			actorOrTaskData: {
				id: actorId,
				userFriendlyId,
			},
			runOptions: runOpts,
			type: 'Actor',
			inputOverride: inputOverride?.input,
			silent: true,
			waitForRunToFinish: false,
			printRunLogs: false,
		});

		let run!: ActorRun;

		for await (const yieldedRun of iterator) {
			run = yieldedRun;
		}

		if (this.flags.json) {
			return run;
		}

		const url = `https://console.apify.com/actors/${actorId}/runs/${run.id}`;
		const datasetUrl = `https://console.apify.com/storage/datasets/${run.defaultDatasetId}`;

		const message: string[] = [
			`${chalk.gray('Run:')} Calling Actor ${userFriendlyId} (${chalk.gray(actorId)})`,
			'',
			`${chalk.yellow('Started')}: ${TimestampFormatter.display(run.startedAt)}`,
		];

		if (run.containerUrl) {
			// container url
			message.push(`${chalk.yellow('Container URL')}: ${chalk.blue(run.containerUrl)}`);
		}

		// basic version info

		const expectedActorVersion = run.buildNumber.split('.').slice(0, 2).join('.');

		const actorVersion = actorData.versions.find((item) => item.versionNumber === expectedActorVersion);

		const runVersionTaggedAs = Object.entries(
			(actorData.taggedBuilds ?? {}) as Record<string, ActorTaggedBuild>,
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

		// timeout
		message.push(`${chalk.yellow('Timeout')}: ${run.options.timeoutSecs.toLocaleString('en-US')} seconds`);

		// memory limit
		message.push(`${chalk.yellow('Memory')}: ${run.options.memoryMbytes} MB`);

		// url
		message.push(
			'',
			`${chalk.blue('Export results')}: ${datasetUrl!}`,
			`${chalk.blue('View on Apify Console')}: ${url}`,
		);

		simpleLog({
			message: message.join('\n'),
			stdout: true,
		});

		return undefined;
	}
}
