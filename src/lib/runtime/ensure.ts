import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import chalk from 'chalk';

import { ACTOR_RUNTIME_CONFIG_FILE_PATH } from '../consts.js';
import { execWithLog } from '../exec.js';
import { ensureApifyDirectory } from '../files.js';
import { error, info } from '../outputs.js';
import {
	CONTAINER_ENGINE_ENV_VAR,
	DEFAULT_ACTOR_RUNTIME_IMAGE,
	type ContainerEngine,
	engineDaemonHint,
	engineInstallHint,
	findContainerEngine,
	imageExistsLocally,
	requestedContainerEngine,
} from './docker.js';

export interface EnsureActorRuntimeImageOptions {
	image: string;
	forcePull?: boolean;
}

/** The image the last 'apify runtime install' fetched, or the default when nothing was installed yet. */
export function installedActorRuntimeImage(): string {
	try {
		const { image } = JSON.parse(readFileSync(ACTOR_RUNTIME_CONFIG_FILE_PATH(), 'utf-8'));
		return typeof image === 'string' && image ? image : DEFAULT_ACTOR_RUNTIME_IMAGE;
	} catch {
		return DEFAULT_ACTOR_RUNTIME_IMAGE;
	}
}

export function rememberInstalledActorRuntimeImage(image: string) {
	ensureApifyDirectory(ACTOR_RUNTIME_CONFIG_FILE_PATH());
	writeFileSync(ACTOR_RUNTIME_CONFIG_FILE_PATH(), JSON.stringify({ image }, null, '\t'));
}

/**
 * Finds a working container engine (Docker or Podman) and makes the Actor runtime image available on it.
 * Resolves to the engine to drive, or null after printing a user-facing error and setting the exit code.
 */
export async function ensureActorRuntimeImage({
	image,
	forcePull = false,
}: EnsureActorRuntimeImageOptions): Promise<ContainerEngine | null> {
	const found = await findContainerEngine();
	if (!found) {
		const requested = requestedContainerEngine();
		error({
			message: requested
				? `${CONTAINER_ENGINE_ENV_VAR}=${requested} is set, but the '${requested}' command was not found.\n  ${engineInstallHint(requested)}`
				: `Docker or Podman is required to run the Actor runtime, but neither the 'docker' nor the 'podman' command was found.\n  ${engineInstallHint('docker')}\n  ${engineInstallHint('podman')}`,
		});
		process.exitCode = 1;
		return null;
	}

	const { engine, ready } = found;
	if (!ready) {
		error({
			message:
				engine === 'podman'
					? `Podman is installed, but its API socket is not being served.\n  ${engineDaemonHint(engine)}`
					: `Docker is installed, but the Docker daemon is not running or not reachable.\n  ${engineDaemonHint(engine)}`,
		});
		process.exitCode = 1;
		return null;
	}

	if (!forcePull && (await imageExistsLocally(engine, image))) {
		info({ message: `Actor runtime image '${image}' is already available locally.` });
		rememberInstalledActorRuntimeImage(image);
		return engine;
	}

	info({ message: `Downloading the Actor runtime image '${image}'...` });

	try {
		await execWithLog({ cmd: engine, args: ['pull', image] });
		rememberInstalledActorRuntimeImage(image);
		return engine;
	} catch {
		error({
			message: [
				`Could not pull '${image}'.`,
				`  Check that you are online and can access the image - a private repository needs ${chalk.white.bold(`${engine} login`)} first.`,
				'  You can also build the image locally from an actor-runtime checkout instead:',
				chalk.white.bold(`    ${engine} build -t ${image} .`),
			].join('\n'),
		});
		process.exitCode = 1;
		return null;
	}
}
