import process from 'node:process';

import { execa } from 'execa';
import which from 'which';

export const ACTOR_RUNTIME_IMAGE = 'apify/actor-runtime:latest';

export const ACTOR_RUNTIME_CONTAINER_NAME = 'apify-actor-runtime';

/** The engine network Actor containers run on. The runtime container starts on it so Actors reach the runtime's API directly. */
export const ACTOR_RUNTIME_NETWORK_NAME = 'apify-local';

/** Official Docker documentation: Docker Desktop for macOS, Windows and Linux desktops. */
export const DOCKER_GET_DOCKER_URL = 'https://docs.docker.com/get-started/get-docker/';

/** Official Docker documentation: Docker Engine (server/headless Linux installs). */
export const DOCKER_ENGINE_INSTALL_URL = 'https://docs.docker.com/engine/install/';

/** Official Podman documentation: installation on every platform. */
export const PODMAN_INSTALL_URL = 'https://podman.io/docs/installation';

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

/** The container engines the runtime can run on. Both serve the Docker-compatible API the runtime uses. */
export type ContainerEngine = 'docker' | 'podman';

export const CONTAINER_ENGINES: readonly ContainerEngine[] = ['docker', 'podman'];

/** Set to `docker` or `podman` to pick the engine instead of taking the first one found on PATH. */
export const CONTAINER_ENGINE_ENV_VAR = 'APIFY_CONTAINER_ENGINE';

/** Host path of the engine's API socket to mount into the runtime container, when auto-detection is wrong. */
export const CONTAINER_SOCKET_ENV_VAR = 'APIFY_CONTAINER_SOCKET';

/** Where the runtime container expects the engine's API socket. */
export const RUNTIME_SOCKET_PATH = '/var/run/docker.sock';

export function runtimeEnvExportLines(): string[] {
	return Object.entries(ACTOR_RUNTIME_ENV_VARS).map(([name, value]) => `export ${name}=${value}`);
}

/** The engine the user asked for via `APIFY_CONTAINER_ENGINE`, or undefined for "whichever is installed". */
export function requestedContainerEngine(env: NodeJS.ProcessEnv = process.env): ContainerEngine | undefined {
	const value = env[CONTAINER_ENGINE_ENV_VAR]?.trim().toLowerCase();
	return CONTAINER_ENGINES.find((engine) => engine === value);
}

/**
 * The engines whose command is on PATH, in preference order: only the requested one when
 * `APIFY_CONTAINER_ENGINE` is set, else Docker before Podman.
 */
export async function installedContainerEngines(env: NodeJS.ProcessEnv = process.env): Promise<ContainerEngine[]> {
	const requested = requestedContainerEngine(env);
	const candidates = requested ? [requested] : CONTAINER_ENGINES;
	const installed: ContainerEngine[] = [];
	for (const engine of candidates) {
		if (await which(engine, { nothrow: true })) installed.push(engine);
	}
	return installed;
}

/** The first installed engine that is actually ready to run containers, else the first installed one
 * (so its problem gets reported), else null when no engine command is on PATH. */
export async function findContainerEngine(
	env: NodeJS.ProcessEnv = process.env,
): Promise<{ engine: ContainerEngine; ready: boolean } | null> {
	const installed = await installedContainerEngines(env);
	for (const engine of installed) {
		if (await isEngineReady(engine)) return { engine, ready: true };
	}
	return installed[0] ? { engine: installed[0], ready: false } : null;
}

/** The engine on which the runtime container is currently running, if any - checked on every installed
 * engine, since the container may live on Podman while Docker is also on PATH. */
export async function findRunningRuntimeEngine(env: NodeJS.ProcessEnv = process.env): Promise<ContainerEngine | null> {
	for (const engine of await installedContainerEngines(env)) {
		if (await isRuntimeContainerRunning(engine)) return engine;
	}
	return null;
}

export function engineInstallHint(engine: ContainerEngine, platform: NodeJS.Platform = process.platform): string {
	if (engine === 'podman') {
		return `Install Podman: ${PODMAN_INSTALL_URL}`;
	}
	switch (platform) {
		case 'darwin':
			return 'Install Docker Desktop for Mac: https://docs.docker.com/desktop/setup/install/mac-install/';
		case 'win32':
			return 'Install Docker Desktop for Windows (WSL 2 backend): https://docs.docker.com/desktop/setup/install/windows-install/';
		default:
			return 'Install Docker Engine: https://docs.docker.com/engine/install/';
	}
}

export function engineDaemonHint(engine: ContainerEngine, platform: NodeJS.Platform = process.platform): string {
	if (engine === 'podman') {
		switch (platform) {
			case 'darwin':
			case 'win32':
				return `Start the Podman machine: 'podman machine start'.`;
			default:
				return (
					`Serve Podman's API socket: 'systemctl --user enable --now podman.socket' (rootless) or ` +
					`'sudo systemctl enable --now podman.socket' (rootful); without systemd, 'podman system service --time=0 &'.`
				);
		}
	}
	switch (platform) {
		case 'darwin':
		case 'win32':
			return 'Start Docker Desktop and wait until it reports "Docker Desktop is running".';
		default:
			return `Start the Docker daemon, e.g. 'sudo systemctl start docker'.`;
	}
}

/**
 * True when the engine can run containers for us. For Podman that also means its API socket is being
 * served - the runtime container needs to mount it - which `podman info` reports separately from Podman
 * itself working.
 */
export async function isEngineReady(engine: ContainerEngine): Promise<boolean> {
	try {
		if (engine === 'podman') {
			const { stdout } = await execa('podman', ['info', '--format', '{{.Host.RemoteSocket.Exists}}']);
			return stdout.trim() === 'true';
		}
		await execa('docker', ['info', '--format', '{{.ServerVersion}}']);
		return true;
	} catch {
		return false;
	}
}

export async function imageExistsLocally(engine: ContainerEngine, image: string): Promise<boolean> {
	try {
		await execa(engine, ['image', 'inspect', image]);
		return true;
	} catch {
		return false;
	}
}

/** Creates the network the runtime container starts on if the engine does not have it yet. */
export async function ensureRuntimeNetwork(engine: ContainerEngine): Promise<void> {
	try {
		await execa(engine, ['network', 'inspect', ACTOR_RUNTIME_NETWORK_NAME]);
		return;
	} catch {
		// Not there yet - created below.
	}
	await execa(engine, ['network', 'create', ACTOR_RUNTIME_NETWORK_NAME]);
}

export async function isRuntimeContainerRunning(engine: ContainerEngine): Promise<boolean> {
	try {
		const { stdout } = await execa(engine, [
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

function unixSocketPath(url: string | undefined): string | undefined {
	return url?.startsWith('unix://') ? url.slice('unix://'.length) : undefined;
}

/**
 * Host path of the engine's API socket, to be mounted into the runtime container. `APIFY_CONTAINER_SOCKET`
 * wins when set. Docker: the `DOCKER_HOST` socket when it is a unix socket (rootless Docker), else the
 * default one. Podman: whatever `podman info` says it serves - rootful `/run/podman/podman.sock`, rootless
 * `$XDG_RUNTIME_DIR/podman/podman.sock`; on macOS/Windows that is a host-side forwarding socket, so the
 * path inside the Podman machine is used instead, where the runtime container actually runs.
 */
export async function resolveEngineSocketPath(
	engine: ContainerEngine,
	platform: NodeJS.Platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
	const override = env[CONTAINER_SOCKET_ENV_VAR]?.trim();
	if (override) return override;

	if (engine === 'docker') {
		return unixSocketPath(env.DOCKER_HOST) ?? RUNTIME_SOCKET_PATH;
	}

	if (platform === 'darwin' || platform === 'win32') {
		return podmanMachineSocketPath();
	}

	try {
		const { stdout } = await execa('podman', ['info', '--format', '{{.Host.RemoteSocket.Path}}']);
		const reported = stdout.trim();
		return unixSocketPath(reported) ?? reported;
	} catch {
		return '/run/podman/podman.sock';
	}
}

/** Best effort for `podman machine`: the socket path as seen inside the VM, rootful or rootless. */
async function podmanMachineSocketPath(): Promise<string> {
	try {
		const { stdout: rootful } = await execa('podman', ['machine', 'inspect', '--format', '{{.Rootful}}']);
		if (rootful.trim() === 'true') return '/run/podman/podman.sock';
		const { stdout: runtimeDir } = await execa('podman', ['machine', 'ssh', '--', 'echo', '$XDG_RUNTIME_DIR']);
		if (runtimeDir.trim()) return `${runtimeDir.trim()}/podman/podman.sock`;
	} catch {
		// Fall through to the rootful default below.
	}
	return '/run/podman/podman.sock';
}

export function socketMountArg(hostSocketPath: string, platform: NodeJS.Platform = process.platform): string {
	// Docker Desktop on Windows exposes the Linux engine's socket to containers under the same
	// path; the leading double slash prevents MSYS/Git Bash shells from mangling it.
	const hostSocket = platform === 'win32' && hostSocketPath.startsWith('/') ? `/${hostSocketPath}` : hostSocketPath;
	return `${hostSocket}:${RUNTIME_SOCKET_PATH}`;
}

export interface RuntimeRunArgsOptions {
	dataDir: string;
	detach: boolean;
	hostSocketPath: string;
	platform?: NodeJS.Platform;
}

export function buildRuntimeRunArgs({
	dataDir,
	detach,
	hostSocketPath,
	platform = process.platform,
}: RuntimeRunArgsOptions): string[] {
	// --init makes signals (Ctrl+C) reach the runtime process even though it runs as the container's PID 1.
	// --network puts the runtime on the Actors' network from the start, on every engine and rootless or not;
	// the runtime joining it later by itself is refused under rootless Podman.
	const args = [
		'run',
		'--rm',
		'--init',
		'--name',
		ACTOR_RUNTIME_CONTAINER_NAME,
		'--network',
		ACTOR_RUNTIME_NETWORK_NAME,
	];

	if (detach) {
		args.push('--detach');
	}

	args.push(
		'-p',
		`${ACTOR_RUNTIME_API_PORT}:${ACTOR_RUNTIME_API_PORT}`,
		'-p',
		`${ACTOR_RUNTIME_CONSOLE_PORT}:${ACTOR_RUNTIME_CONSOLE_PORT}`,
		'-v',
		socketMountArg(hostSocketPath, platform),
		'-v',
		`${dataDir}:/data`,
		ACTOR_RUNTIME_IMAGE,
	);

	return args;
}
