import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';

import chalk from 'chalk';
import { execa, type ExecaError } from 'execa';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { GLOBAL_CONFIGS_FOLDER, INTERRUPT_SIGNALS } from '../../lib/consts.js';
import { error, info, run } from '../../lib/outputs.js';
import {
	ACTOR_RUNTIME_API_PORT,
	ACTOR_RUNTIME_CONSOLE_PORT,
	ACTOR_RUNTIME_CONTAINER_NAME,
	buildRuntimeRunArgs,
	isRuntimeContainerRunning,
} from '../../lib/runtime/docker.js';
import { ensureActorRuntimeImage } from '../../lib/runtime/ensure.js';

const defaultDataDir = () => join(GLOBAL_CONFIGS_FOLDER(), 'actor-runtime', 'data');

export class RuntimeStartCommand extends ApifyCommand<typeof RuntimeStartCommand> {
	static override name = 'start' as const;

	static override description =
		`Starts the Actor runtime, a local Apify platform running as a Docker container.\n` +
		`Installs the runtime first when needed (like 'apify runtime install'). The runtime API listens on ` +
		`http://localhost:${ACTOR_RUNTIME_API_PORT} and the console on http://localhost:${ACTOR_RUNTIME_CONSOLE_PORT}.`;

	static override group = 'Local Actor Development';

	static override examples = [
		{
			description: 'Start the Actor runtime in the foreground (Ctrl+C stops it).',
			command: 'apify runtime start',
		},
		{
			description: 'Start the Actor runtime in the background.',
			command: 'apify runtime start --detach',
		},
		{
			description: 'Start with runtime data stored in a custom directory.',
			command: 'apify runtime start --data-dir ./data',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-runtime-start';

	static override flags = {
		'data-dir': Flags.string({
			description:
				'Host directory mounted as the runtime data directory (storages, builds and run records). Defaults to ~/.apify/actor-runtime/data.',
		}),
		detach: Flags.boolean({
			char: 'd',
			description: `Run the runtime container in the background. Stop it with 'apify runtime stop'.`,
			default: false,
		}),
	};

	async run() {
		if (await isRuntimeContainerRunning()) {
			error({
				message: `The Actor runtime is already running (container '${ACTOR_RUNTIME_CONTAINER_NAME}'). Stop it with 'apify runtime stop' first.`,
			});
			process.exitCode = 1;
			return;
		}

		if (!(await ensureActorRuntimeImage())) return;

		const dataDir = resolve(this.flags.dataDir ?? defaultDataDir());
		await mkdir(dataDir, { recursive: true });

		info({
			message: [
				`Starting the Actor runtime (data directory: ${dataDir})...`,
				'',
				`  API:     http://localhost:${ACTOR_RUNTIME_API_PORT}`,
				`  Console: http://localhost:${ACTOR_RUNTIME_CONSOLE_PORT}`,
				'',
				'Point the Apify CLI at the runtime with:',
				chalk.white.bold(`  export APIFY_CLIENT_BASE_URL=http://localhost:${ACTOR_RUNTIME_API_PORT}`),
				chalk.white.bold(`  export APIFY_CONSOLE_URL=http://localhost:${ACTOR_RUNTIME_CONSOLE_PORT}`),
			].join('\n'),
		});

		// Spawned without a shell so interrupt signals reach 'docker run' directly instead of dying in 'sh -c'.
		const args = buildRuntimeRunArgs({ dataDir, detach: this.flags.detach });
		run({ message: `docker ${args.join(' ')}` });

		const child = execa('docker', args, { stdio: 'inherit' });

		let interrupted = false;
		const cleanupSignalHandlers = INTERRUPT_SIGNALS.map((signal) => {
			const handler = () => {
				interrupted = true;
				child.kill(signal);
			};
			process.on(signal, handler);
			return () => process.off(signal, handler);
		});

		try {
			await child;
		} catch (err) {
			if (!interrupted) {
				error({ message: `The Actor runtime exited with an error: ${(err as ExecaError).shortMessage ?? err}` });
				process.exitCode = 1;
				return;
			}
		} finally {
			for (const cleanup of cleanupSignalHandlers) cleanup();
		}

		if (this.flags.detach) {
			info({
				message: `The Actor runtime is running in the background. Stop it with 'apify runtime stop'.`,
			});
		}
	}
}
