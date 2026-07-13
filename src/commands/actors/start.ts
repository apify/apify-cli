import process from 'node:process';

import type { ActorRun, ActorStartOptions } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand, StdinMode } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { consoleRunUrl } from '../../lib/commands/agent-output.js';
import { getInputOverride } from '../../lib/commands/resolve-input.js';
import { runActorOrTaskOnCloud, SharedRunOnCloudFlags } from '../../lib/commands/run-on-cloud.js';
import { getConsoleBaseUrl, LOCAL_CONFIG_PATH } from '../../lib/consts.js';
import { simpleLog } from '../../lib/outputs.js';
import { getLocalConfig, getLocalUserInfo, getLoggedClientOrThrow, printJsonToStdout } from '../../lib/utils.js';
import { ActorsCallCommand } from './call.js';

export class ActorsStartCommand extends ApifyCommand<typeof ActorsStartCommand> {
	static override name = 'start' as const;

	static override description =
		'Starts Actor remotely and returns run details immediately.\n' +
		'Uses authenticated account and local key-value store for input.';

	static override examples = [
		{
			description: 'Start the Actor defined in the current directory and return immediately.',
			command: 'apify actors start',
		},
		{
			description: 'Start a specific Actor with inline JSON input.',
			command: `apify actors start apify/hello-world --input '{"url":"https://example.com"}'`,
		},
		{
			description: 'Start with input from a file and custom memory/timeout.',
			command: 'apify actors start apify/web-scraper --input-file ./input.json --memory 4096 --timeout 600',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-actors-start';

	static override flags = {
		...SharedRunOnCloudFlags('Actor'),
		input: Flags.string({
			char: 'i',
			description: 'Optional JSON input to be given to the Actor.',
			required: false,
			stdin: StdinMode.Stringified,
			exclusive: ['input-file'],
		}),
		'input-file': Flags.string({
			aliases: ['if'],
			description:
				'Optional path to a file with JSON input to be given to the Actor. The file must be a valid JSON file. You can also specify `-` to read from standard input.',
			required: false,
			stdin: StdinMode.Stringified,
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

		let run: ActorRun | undefined;

		for await (const yieldedRun of iterator) {
			run = yieldedRun;
		}

		if (!run) {
			simpleLog({ message: 'Actor run did not start.', stdout: false });
			process.exitCode = 1;
			return;
		}

		const url = consoleRunUrl(actorId, run.id);

		if (this.flags.json) {
			printJsonToStdout({
				ok: true,
				operation: 'actors.start',
				waited: false,
				actor: {
					id: actorId,
					url: `${getConsoleBaseUrl()}/actors/${actorId}`,
				},
				run: {
					id: run.id,
					status: run.status,
					url,
				},
				next: {
					wait: `apify runs wait ${run.id} --json`,
					log: `apify runs log ${run.id}`,
					info: `apify runs info ${run.id} --json`,
				},
				exitCode: 0,
			});
			return;
		}

		const message = [
			chalk.greenBright('Run started.'),
			'',
			`${chalk.yellow('Actor')}: ${actorData.name} (${chalk.gray(actorId)})`,
			`${chalk.yellow('Run ID')}: ${run.id}`,
			`${chalk.yellow('Status')}: ${run.status}`,
			'',
			chalk.gray('This command does not wait for the run to finish.'),
			'',
			'To wait for the final status:',
			`  apify runs wait ${run.id} --json`,
			'',
			'To stream or inspect logs:',
			`  apify runs log ${run.id}`,
			'',
			'To inspect run metadata:',
			`  apify runs info ${run.id} --json`,
		];

		simpleLog({
			message: message.join('\n'),
			stdout: true,
		});
	}
}
