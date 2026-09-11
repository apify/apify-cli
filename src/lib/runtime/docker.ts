import process from 'node:process';

import { execa } from 'execa';
import which from 'which';

export const DEFAULT_ACTOR_RUNTIME_IMAGE = 'apify/actor-runtime:latest';

export const ACTOR_RUNTIME_CONTAINER_NAME = 'apify-actor-runtime';

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

const CONTAINER_ENGINES: readonly ContainerEngine[] = ['docker', 'podman'];

/** Set to `docker` or `podman` to pick the engine instead of taking the first one found on PATH. */
export const CONTAINER_ENGINE_ENV_VAR = 'APIFY_CONTAINER_ENGINE';

/** Where the runtime container expects the engine's API socket. */
export const RUNTIME_SOCKET_PATH = '/var/run/docker.sock';

/** Where the runtime container expects its data directory (storages, builds and run records). */
export const RUNTIME_DATA_PATH = '/data';

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

/** A port the runtime container publishes: `containerPort/protocol` reachable at `hostAddress`. */
export interface PublishedPort {
	containerPort: number;
	protocol: string;
	hostAddress: string;
}

export interface RuntimeContainerInfo {
	engine: ContainerEngine;
	image?: string;
	status?: string;
	startedAt?: string;
	/** The host directory mounted as the runtime's `/data`, where storages, builds and run records live. */
	dataDir?: string;
	ports: PublishedPort[];
}

interface InspectedContainer {
	Name?: string;
	ImageName?: string;
	Config?: { Image?: string };
	State?: { Status?: string; StartedAt?: string };
	Mounts?: { Destination?: string; Source?: string }[];
	NetworkSettings?: { Ports?: Record<string, { HostIp?: string; HostPort?: string }[] | null> };
	HostConfig?: { PortBindings?: Record<string, { HostIp?: string; HostPort?: string }[] | null> };
}

function parsePublishedPorts(container: InspectedContainer): PublishedPort[] {
	const bindings = container.NetworkSettings?.Ports ?? container.HostConfig?.PortBindings ?? {};
	const ports: PublishedPort[] = [];

	for (const [portAndProtocol, hostBindings] of Object.entries(bindings)) {
		const [port, protocol = 'tcp'] = portAndProtocol.split('/');
		const containerPort = Number(port);
		if (!Number.isInteger(containerPort)) continue;

		for (const binding of hostBindings ?? []) {
			if (!binding?.HostPort) continue;
			// An empty HostIp means every interface, which both engines print as 0.0.0.0.
			ports.push({ containerPort, protocol, hostAddress: `${binding.HostIp || '0.0.0.0'}:${binding.HostPort}` });
		}
	}

	return ports.sort((a, b) => a.containerPort - b.containerPort);
}

/** Reads one `inspect --format '{{json .}}'` payload, in either engine's shape. Null when it is unusable. */
export function parseRuntimeContainerInfo(engine: ContainerEngine, raw: string): RuntimeContainerInfo | null {
	let container: InspectedContainer;
	try {
		container = JSON.parse(raw) as InspectedContainer;
	} catch {
		return null;
	}

	if (!container || typeof container !== 'object') return null;

	return {
		engine,
		// Docker reports the image under Config, Podman at the top level.
		image: container.Config?.Image ?? container.ImageName,
		status: container.State?.Status,
		startedAt: container.State?.StartedAt,
		dataDir: container.Mounts?.find((mount) => mount.Destination === RUNTIME_DATA_PATH)?.Source,
		ports: parsePublishedPorts(container),
	};
}

/**
 * What the engine knows about the runtime container - its image, published ports and data directory.
 * Null when the container is gone or the engine cannot be asked about it.
 */
export async function inspectRuntimeContainer(engine: ContainerEngine): Promise<RuntimeContainerInfo | null> {
	try {
		const { stdout } = await execa(engine, ['inspect', ACTOR_RUNTIME_CONTAINER_NAME, '--format', '{{json .}}']);
		return parseRuntimeContainerInfo(engine, stdout);
	} catch {
		return null;
	}
}

function unixSocketPath(url: string | undefined): string | undefined {
	return url?.startsWith('unix://') ? url.slice('unix://'.length) : undefined;
}

/**
 * Host path of the engine's API socket, to be mounted into the runtime container. Docker: the `DOCKER_HOST`
 * socket when it is a unix socket (rootless Docker), else the default one. Podman: the socket `podman info`
 * reports serving, which is the path on the machine the containers run on (rootful, rootless, or inside a
 * `podman machine` VM alike).
 */
export async function resolveEngineSocketPath(
	engine: ContainerEngine,
	env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
	if (engine === 'docker') {
		return unixSocketPath(env.DOCKER_HOST) ?? RUNTIME_SOCKET_PATH;
	}

	try {
		const { stdout } = await execa('podman', ['info', '--format', '{{.Host.RemoteSocket.Path}}']);
		const reported = stdout.trim();
		return unixSocketPath(reported) ?? reported;
	} catch {
		return '/run/podman/podman.sock';
	}
}

export function socketMountArg(hostSocketPath: string, platform: NodeJS.Platform = process.platform): string {
	// Docker Desktop on Windows exposes the Linux engine's socket to containers under the same
	// path; the leading double slash prevents MSYS/Git Bash shells from mangling it.
	const hostSocket = platform === 'win32' && hostSocketPath.startsWith('/') ? `/${hostSocketPath}` : hostSocketPath;
	return `${hostSocket}:${RUNTIME_SOCKET_PATH}`;
}

export interface RuntimeRunArgsOptions {
	image: string;
	dataDir: string;
	detach: boolean;
	hostSocketPath: string;
	platform?: NodeJS.Platform;
}

export function buildRuntimeRunArgs({
	image,
	dataDir,
	detach,
	hostSocketPath,
	platform = process.platform,
}: RuntimeRunArgsOptions): string[] {
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
		socketMountArg(hostSocketPath, platform),
		'-v',
		`${dataDir}:${RUNTIME_DATA_PATH}`,
		image,
	);

	return args;
}
