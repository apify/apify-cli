import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';

import chalk from 'chalk';
import { execa, type ExecaError } from 'execa';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { GLOBAL_CONFIGS_FOLDER, INTERRUPT_SIGNALS } from '../../lib/consts.js';
import { error, info, run } from '../../lib/outputs.js';
import { updateActorRuntimeConfig } from '../../lib/runtime/config.js';
import {
	ACTOR_RUNTIME_API_PORT,
	ACTOR_RUNTIME_API_URL,
	ACTOR_RUNTIME_CONSOLE_PORT,
	ACTOR_RUNTIME_CONSOLE_URL,
	ACTOR_RUNTIME_CONTAINER_NAME,
	buildRuntimeRunArgs,
	caFileFromEnv,
	findRunningRuntimeEngine,
	podmanInfo,
	resolveEngineSocketPath,
	runtimeNetworkMode,
	runtimeSecurityOptions,
	runtimeApiUrl,
	runtimeConsoleUrl,
	runtimeEnvExportLines,
	runtimeSkillHintLines,
} from '../../lib/runtime/docker.js';
import { ensureActorRuntimeImage, installedActorRuntimeImage } from '../../lib/runtime/ensure.js';
import { writeCaFileForRuntime } from '../../lib/runtime/host-ca.js';
import { configuredRuntimePorts } from '../../lib/runtime/target.js';

const isValidPort = (port: number) => Number.isInteger(port) && port >= 1 && port <= 65535;

const defaultDataDir = () => join(GLOBAL_CONFIGS_FOLDER(), 'actor-runtime', 'data');

export class RuntimeStartCommand extends ApifyCommand<typeof RuntimeStartCommand> {
	static override name = 'start' as const;

	static override description =
		`Starts the Actor runtime, a local Apify platform running as a container on Docker or Podman.\n` +
		`Installs the runtime first when needed (like 'apify runtime install'). The runtime API listens on ` +
		`${ACTOR_RUNTIME_API_URL} and the console on ${ACTOR_RUNTIME_CONSOLE_URL} unless moved with --api-port and ` +
		`--console-port, which are remembered for later starts and for 'apify runtime connect'. Run 'apify runtime -h' ` +
		`for the environment variables that point the CLI at it.`;

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
		{
			description: 'Start on other ports when 3333 or 3000 is already taken.',
			command: 'apify runtime start --api-port 4333 --console-port 4000',
		},
		{
			description: 'Let builds trust the CA of a proxy that re-signs outbound HTTPS.',
			command: 'apify runtime start --ca-file ./proxy-ca.pem',
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
		'api-port': Flags.integer({
			description: `Host port for the runtime API. Defaults to the port of the previous start, else ${ACTOR_RUNTIME_API_PORT}.`,
		}),
		'ca-file': Flags.string({
			description:
				`PEM file with CA certificates to trust on top of the ones of this machine, which Actor builds (and their runs) trust, for networks that re-sign outbound HTTPS. ` +
				`Defaults to the file named by NODE_EXTRA_CA_CERTS, SSL_CERT_FILE, REQUESTS_CA_BUNDLE or CURL_CA_BUNDLE, in that order.`,
		}),
		'no-host-ca': Flags.boolean({
			description: `Do not hand this machine's trusted CA certificates to the runtime. By default Actor builds trust the ones its own image lacks.`,
			default: false,
		}),
		'console-port': Flags.integer({
			description: `Host port for the runtime console. Defaults to the port of the previous start, else ${ACTOR_RUNTIME_CONSOLE_PORT}.`,
		}),
	};

	async run() {
		if (await findRunningRuntimeEngine()) {
			error({
				message: `The Actor runtime is already running (container '${ACTOR_RUNTIME_CONTAINER_NAME}'). Stop it with 'apify runtime stop' first.`,
			});
			process.exitCode = 1;
			return;
		}

		const previous = configuredRuntimePorts();
		const ports = {
			api: this.flags.apiPort ?? previous.api,
			console: this.flags.consolePort ?? previous.console,
		};
		if (!isValidPort(ports.api) || !isValidPort(ports.console)) {
			error({ message: 'Ports must be integers between 1 and 65535.' });
			process.exitCode = 1;
			return;
		}
		if (ports.api === ports.console) {
			error({ message: `The API and console need different ports, both are ${ports.api}.` });
			process.exitCode = 1;
			return;
		}

		const explicitCaFile = this.flags.caFile;
		if (explicitCaFile && !existsSync(explicitCaFile)) {
			error({ message: `The CA file '${explicitCaFile}' does not exist.` });
			process.exitCode = 1;
			return;
		}
		// A CA variable naming a missing file is that tool's own warning to give, not a reason to refuse starting.
		const caFile = explicitCaFile ?? caFileFromEnv();
		const extraCaFile = caFile ? resolve(caFile) : undefined;
		// What this machine trusts is exported for the runtime, which cannot see it from its container; it keeps
		// only the certificates its own image lacks, so a machine with nothing special changes no build.
		const runtimeCaFile = await writeCaFileForRuntime(join(GLOBAL_CONFIGS_FOLDER(), 'actor-runtime', 'host-ca.pem'), {
			extraCaFile,
			hostStore: !this.flags.noHostCa,
		});

		const image = installedActorRuntimeImage();
		const engine = await ensureActorRuntimeImage({ image });
		if (!engine) return;

		const hostSocketPath = await resolveEngineSocketPath(engine);
		const podman = engine === 'podman' ? await podmanInfo() : undefined;
		const networkMode = runtimeNetworkMode(engine, podman);
		const securityOptions = runtimeSecurityOptions(engine, podman);
		const dataDir = resolve(this.flags.dataDir ?? defaultDataDir());
		await mkdir(dataDir, { recursive: true });
		updateActorRuntimeConfig({ apiPort: ports.api, consolePort: ports.console });

		info({
			message: [
				`Starting the Actor runtime (data directory: ${dataDir})...`,
				'',
				`  API:     ${runtimeApiUrl(ports.api)}`,
				`  Console: ${runtimeConsoleUrl(ports.console)}`,
				...(runtimeCaFile ? [`  Builds trust the CA certificates of this machine (exported to ${runtimeCaFile})`] : []),
				'',
				'Point the Apify CLI at the runtime with:',
				...runtimeEnvExportLines(ports).map((line) => chalk.white.bold(`  ${line}`)),
				'',
				...runtimeSkillHintLines(),
			].join('\n'),
		});

		// Spawned without a shell so interrupt signals reach the engine's 'run' directly instead of dying in 'sh -c'.
		const args = buildRuntimeRunArgs({
			image,
			dataDir,
			detach: this.flags.detach,
			hostSocketPath,
			ports,
			networkMode,
			securityOptions,
			caFile: runtimeCaFile,
		});
		run({ message: `${engine} ${args.join(' ')}` });

		const child = execa(engine, args, { stdio: 'inherit' });

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
