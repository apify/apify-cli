import process from 'node:process';

import { execa } from 'execa';
import which from 'which';

export const ACTOR_RUNTIME_IMAGE = 'apify/actor-runtime:latest';

export const ACTOR_RUNTIME_CONTAINER_NAME = 'apify-actor-runtime';

/** Official Docker documentation: Docker Desktop for macOS, Windows and Linux desktops. */
export const DOCKER_GET_DOCKER_URL = 'https://docs.docker.com/get-started/get-docker/';

/** Official Docker documentation: Docker Engine (server/headless Linux installs). */
export const DOCKER_ENGINE_INSTALL_URL = 'https://docs.docker.com/engine/install/';

export const ACTOR_RUNTIME_API_PORT = 3333;

export const ACTOR_RUNTIME_CONSOLE_PORT = 3000;

export const ACTOR_RUNTIME_API_URL = `http://localhost:${ACTOR_RUNTIME_API_PORT}`;

export const ACTOR_RUNTIME_CONSOLE_URL = `http://localhost:${ACTOR_RUNTIME_CONSOLE_PORT}`;

/**
 * Environment variables that point the Apify CLI (and the Apify SDKs/clients that honour them)
 * at a locally running Actor runtime instead of the Apify cloud.
 */
export const ACTOR_RUNTIME_ENV_VARS = {
	APIFY_CLIENT_BASE_URL: ACTOR_RUNTIME_API_URL,
	APIFY_CONSOLE_URL: ACTOR_RUNTIME_CONSOLE_URL,
} as const;

export function runtimeEnvExportLines(): string[] {
	return Object.entries(ACTOR_RUNTIME_ENV_VARS).map(([name, value]) => `export ${name}=${value}`);
}

export async function findDockerExecutable(): Promise<string | null> {
	return which('docker', { nothrow: true });
}

export function dockerInstallHint(platform: NodeJS.Platform = process.platform): string {
	switch (platform) {
		case 'darwin':
			return 'Install Docker Desktop for Mac: https://docs.docker.com/desktop/setup/install/mac-install/';
		case 'win32':
			return 'Install Docker Desktop for Windows (WSL 2 backend): https://docs.docker.com/desktop/setup/install/windows-install/';
		default:
			return 'Install Docker Engine: https://docs.docker.com/engine/install/';
	}
}

export function dockerDaemonHint(platform: NodeJS.Platform = process.platform): string {
	switch (platform) {
		case 'darwin':
		case 'win32':
			return 'Start Docker Desktop and wait until it reports "Docker Desktop is running".';
		default:
			return `Start the Docker daemon, e.g. 'sudo systemctl start docker'.`;
	}
}

export async function isDockerDaemonRunning(): Promise<boolean> {
	try {
		await execa('docker', ['info', '--format', '{{.ServerVersion}}']);
		return true;
	} catch {
		return false;
	}
}

export async function imageExistsLocally(image: string): Promise<boolean> {
	try {
		await execa('docker', ['image', 'inspect', image]);
		return true;
	} catch {
		return false;
	}
}

export async function isRuntimeContainerRunning(): Promise<boolean> {
	try {
		const { stdout } = await execa('docker', [
			'ps',
			'--filter',
			`name=^${ACTOR_RUNTIME_CONTAINER_NAME}$`,
			'--format',
			'{{.Names}}',
		]);
		return stdout.trim().length > 0;
	} catch {
		return false;
	}
}

export function dockerSocketMount(platform: NodeJS.Platform = process.platform): string {
	// Docker Desktop on Windows exposes the Linux engine's socket to containers under the same
	// path; the leading double slash prevents MSYS/Git Bash shells from mangling it.
	const hostSocket = platform === 'win32' ? '//var/run/docker.sock' : '/var/run/docker.sock';
	return `${hostSocket}:/var/run/docker.sock`;
}

export interface RuntimeRunArgsOptions {
	dataDir: string;
	detach: boolean;
	platform?: NodeJS.Platform;
}

export function buildRuntimeRunArgs({ dataDir, detach, platform = process.platform }: RuntimeRunArgsOptions): string[] {
	// --init makes signals (Ctrl+C) reach the runtime process even though it runs as the container's PID 1.
	const args = ['run', '--rm', '--init', '--name', ACTOR_RUNTIME_CONTAINER_NAME];

	if (detach) {
		args.push('--detach');
	}

	args.push(
		'-p',
		`${ACTOR_RUNTIME_API_PORT}:${ACTOR_RUNTIME_API_PORT}`,
		'-p',
		`${ACTOR_RUNTIME_CONSOLE_PORT}:${ACTOR_RUNTIME_CONSOLE_PORT}`,
		'-v',
		dockerSocketMount(platform),
		'-v',
		`${dataDir}:/data`,
		ACTOR_RUNTIME_IMAGE,
	);

	return args;
}
