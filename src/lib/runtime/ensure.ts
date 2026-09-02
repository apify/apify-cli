import process from 'node:process';

import chalk from 'chalk';

import { execWithLog } from '../exec.js';
import { error, info } from '../outputs.js';
import {
	ACTOR_RUNTIME_IMAGE,
	dockerDaemonHint,
	dockerInstallHint,
	findDockerExecutable,
	imageExistsLocally,
	isDockerDaemonRunning,
} from './docker.js';

export interface EnsureActorRuntimeImageOptions {
	forcePull?: boolean;
}

/**
 * Verifies this machine can run Docker images and makes the Actor runtime image available locally.
 * Prints a user-facing error and sets the exit code when something is missing.
 */
export async function ensureActorRuntimeImage({
	forcePull = false,
}: EnsureActorRuntimeImageOptions = {}): Promise<boolean> {
	if (!(await findDockerExecutable())) {
		error({
			message: `Docker is required to run the Actor runtime, but the 'docker' command was not found.\n  ${dockerInstallHint()}`,
		});
		process.exitCode = 1;
		return false;
	}

	if (!(await isDockerDaemonRunning())) {
		error({
			message: `Docker is installed, but the Docker daemon is not running or not reachable.\n  ${dockerDaemonHint()}`,
		});
		process.exitCode = 1;
		return false;
	}

	if (!forcePull && (await imageExistsLocally(ACTOR_RUNTIME_IMAGE))) {
		info({ message: `Actor runtime image '${ACTOR_RUNTIME_IMAGE}' is already available locally.` });
		return true;
	}

	info({ message: `Downloading the Actor runtime image '${ACTOR_RUNTIME_IMAGE}'...` });

	try {
		await execWithLog({ cmd: 'docker', args: ['pull', ACTOR_RUNTIME_IMAGE] });
		return true;
	} catch {
		error({
			message: [
				`Could not pull '${ACTOR_RUNTIME_IMAGE}'. The image is not published to a registry yet.`,
				'Until it is, build it locally from your actor-runtime checkout:',
				chalk.white.bold(`  docker build -t ${ACTOR_RUNTIME_IMAGE} .`),
			].join('\n'),
		});
		process.exitCode = 1;
		return false;
	}
}
