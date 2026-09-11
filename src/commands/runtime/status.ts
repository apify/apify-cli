import process from 'node:process';

import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { simpleLog } from '../../lib/outputs.js';
import {
	ACTOR_RUNTIME_API_PORT,
	ACTOR_RUNTIME_CONSOLE_PORT,
	ACTOR_RUNTIME_CONTAINER_NAME,
	findRunningRuntimeEngine,
	inspectRuntimeContainer,
	type PublishedPort,
} from '../../lib/runtime/docker.js';
import { installedActorRuntimeImage } from '../../lib/runtime/ensure.js';
import { isConnectedToActorRuntime, overridingRuntimeEnvVars, resolveApiBaseUrl } from '../../lib/runtime/target.js';
import { printJsonToStdout } from '../../lib/utils.js';

function portRole(containerPort: number): string {
	if (containerPort === ACTOR_RUNTIME_API_PORT) return 'API';
	if (containerPort === ACTOR_RUNTIME_CONSOLE_PORT) return 'Console';
	return '';
}

function portLine({ containerPort, protocol, hostAddress }: PublishedPort): string {
	const role = portRole(containerPort);
	return `  ${`${containerPort}/${protocol}`.padEnd(10)} -> ${hostAddress}${role ? `  (${role})` : ''}`;
}

export class RuntimeStatusCommand extends ApifyCommand<typeof RuntimeStatusCommand> {
	static override name = 'status' as const;

	static override description =
		`Prints whether the Actor runtime is running, the ports it publishes, the host directory it keeps its data in, ` +
		`and which API the Apify CLI currently talks to.\n` +
		`Exits with code 1 when the runtime is not running, so scripts can test for it.`;

	static override group = 'Local Actor Development';

	static override examples = [
		{
			description: 'Show what the Actor runtime is doing.',
			command: 'apify runtime status',
		},
		{
			description: 'Read the status as JSON.',
			command: 'apify runtime status --json',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-runtime-status';

	static override enableJsonFlag = true;

	async run() {
		const engine = await findRunningRuntimeEngine();
		const container = engine ? await inspectRuntimeContainer(engine) : null;
		const connected = isConnectedToActorRuntime();
		const overrides = overridingRuntimeEnvVars();

		if (this.flags.json) {
			if (!engine) process.exitCode = 1;

			printJsonToStdout({
				running: Boolean(engine),
				engine,
				container: engine ? ACTOR_RUNTIME_CONTAINER_NAME : undefined,
				image: container?.image ?? (engine ? undefined : installedActorRuntimeImage()),
				status: container?.status,
				startedAt: container?.startedAt,
				dataDir: container?.dataDir,
				ports: container?.ports ?? [],
				connected,
				apiBaseUrl: resolveApiBaseUrl() ?? null,
				envOverrides: Object.fromEntries(overrides),
			});
			return;
		}

		const lines: string[] = [];

		if (!engine) {
			lines.push(
				`Actor runtime: ${chalk.yellow('not running')}`,
				'',
				`  Installed image:  ${installedActorRuntimeImage()}`,
				'',
				`Start it with ${chalk.white.bold('apify runtime start --detach')}.`,
			);
		} else {
			lines.push(
				`Actor runtime: ${chalk.green(container?.status ?? 'running')} on ${engine} (container '${ACTOR_RUNTIME_CONTAINER_NAME}')`,
				'',
				`  Image:            ${container?.image ?? installedActorRuntimeImage()}`,
				`  Data directory:   ${container?.dataDir ?? 'unknown'}`,
			);

			if (container?.startedAt) {
				lines.push(`  Started at:       ${container.startedAt}`);
			}

			lines.push('', container?.ports.length ? 'Published ports:' : 'Published ports: none');
			lines.push(...(container?.ports ?? []).map(portLine));
		}

		lines.push('', 'Apify CLI target:');
		lines.push(
			`  ${connected ? `the Actor runtime (${chalk.white.bold('apify runtime connect')})` : `the Apify platform (connect with ${chalk.white.bold('apify runtime connect')})`}`,
		);
		lines.push(`  API base URL:     ${resolveApiBaseUrl() ?? 'https://api.apify.com (default)'}`);

		if (overrides.length) {
			lines.push(
				'',
				'Set in this shell, taking precedence over the connection above:',
				...overrides.map(([name, value]) => `  ${name}=${value}`),
			);
		}

		simpleLog({ message: lines.join('\n') });

		if (!engine) process.exitCode = 1;
	}
}
