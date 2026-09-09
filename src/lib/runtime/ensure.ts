import process from 'node:process';

import chalk from 'chalk';

import { execWithLog } from '../exec.js';
import { error, info } from '../outputs.js';
import {
	ACTOR_RUNTIME_IMAGE,
	CONTAINER_ENGINE_ENV_VAR,
	type ContainerEngine,
	engineDaemonHint,
	engineInstallHint,
	findContainerEngine,
	imageExistsLocally,
	isEngineReady,
	requestedContainerEngine,
} from './docker.js';

export interface EnsureActorRuntimeImageOptions {
	forcePull?: boolean;
}

/**
 * Finds a working container engine (Docker or Podman) and makes the Actor runtime image available on it.
 * Resolves to the engine to drive, or null after printing a user-facing error and setting the exit code.
 */
export async function ensureActorRuntimeImage({
	forcePull = false,
}: EnsureActorRuntimeImageOptions = {}): Promise<ContainerEngine | null> {
	const engine = await findContainerEngine();
	if (!engine) {
		const requested = requestedContainerEngine();
		error({
			message: requested
				? `${CONTAINER_ENGINE_ENV_VAR}=${requested} is set, but the '${requested}' command was not found.\n  ${engineInstallHint(requested)}`
				: `Docker or Podman is required to run the Actor runtime, but neither the 'docker' nor the 'podman' command was found.\n  ${engineInstallHint('docker')}\n  ${engineInstallHint('podman')}`,
		});
		process.exitCode = 1;
		return null;
	}

	if (!(await isEngineReady(engine))) {
		error({
			message:
				engine === 'podman'
					? `Podman is installed, but its API socket is not being served.\n  ${engineDaemonHint(engine)}`
					: `Docker is installed, but the Docker daemon is not running or not reachable.\n  ${engineDaemonHint(engine)}`,
		});
		process.exitCode = 1;
		return null;
	}

	if (!forcePull && (await imageExistsLocally(engine, ACTOR_RUNTIME_IMAGE))) {
		info({ message: `Actor runtime image '${ACTOR_RUNTIME_IMAGE}' is already available locally.` });
		return engine;
	}

	info({ message: `Downloading the Actor runtime image '${ACTOR_RUNTIME_IMAGE}'...` });

	try {
		await execWithLog({ cmd: engine, args: ['pull', ACTOR_RUNTIME_IMAGE] });
		return engine;
	} catch {
		error({
			message: [
				`Could not pull '${ACTOR_RUNTIME_IMAGE}'.`,
				`  Check that you are online and can access the image - a private repository needs ${chalk.white.bold(`${engine} login`)} first.`,
				'  You can also build the image locally from an actor-runtime checkout instead:',
				chalk.white.bold(`    ${engine} build -t ${ACTOR_RUNTIME_IMAGE} .`),
			].join('\n'),
		});
		process.exitCode = 1;
		return null;
	}
}
