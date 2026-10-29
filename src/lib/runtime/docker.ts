import process from 'node:process';

import { execa } from 'execa';
import which from 'which';

export const DEFAULT_ACTOR_RUNTIME_IMAGE = 'apify/actor-runtime:latest';

export const ACTOR_RUNTIME_CONTAINER_NAME = 'apify-actor-runtime';

export const DOCKER_GET_DOCKER_URL = 'https://docs.docker.com/get-started/get-docker/';

export const DOCKER_ENGINE_INSTALL_URL = 'https://docs.docker.com/engine/install/';

export const PODMAN_INSTALL_URL = 'https://podman.io/docs/installation';

export const ACTOR_RUNTIME_API_PORT = 3333;

export const ACTOR_RUNTIME_CONSOLE_PORT = 3000;

export interface RuntimePorts {
	api: number;
	console: number;
}

export const DEFAULT_RUNTIME_PORTS: RuntimePorts = {
	api: ACTOR_RUNTIME_API_PORT,
	console: ACTOR_RUNTIME_CONSOLE_PORT,
};

export const runtimeApiUrl = (port: number) => `http://localhost:${port}`;

export const runtimeConsoleUrl = (port: number) => `http://localhost:${port}`;

export const ACTOR_RUNTIME_API_URL = runtimeApiUrl(ACTOR_RUNTIME_API_PORT);

export const ACTOR_RUNTIME_CONSOLE_URL = runtimeConsoleUrl(ACTOR_RUNTIME_CONSOLE_PORT);

/** Both serve the Docker-compatible API the runtime uses. */
export type ContainerEngine = 'docker' | 'podman';

const CONTAINER_ENGINES: readonly ContainerEngine[] = ['docker', 'podman'];

/** Set to `docker` or `podman` to pick the engine instead of taking the first one found on PATH. */
export const CONTAINER_ENGINE_ENV_VAR = 'APIFY_CONTAINER_ENGINE';

/** Where the runtime container expects the engine's API socket and its data directory. */
const RUNTIME_SOCKET_PATH = '/var/run/docker.sock';

const RUNTIME_DATA_PATH = '/data';

export function runtimeEnvExportLines(ports: RuntimePorts = DEFAULT_RUNTIME_PORTS): string[] {
	return [
		`export APIFY_CLIENT_BASE_URL=${runtimeApiUrl(ports.api)}`,
		`export APIFY_CONSOLE_URL=${runtimeConsoleUrl(ports.console)}`,
	];
}

export function requestedContainerEngine(env: NodeJS.ProcessEnv = process.env): ContainerEngine | undefined {
	const value = env[CONTAINER_ENGINE_ENV_VAR]?.trim().toLowerCase();
	return CONTAINER_ENGINES.find((engine) => engine === value);
}

/** Only the requested engine when `APIFY_CONTAINER_ENGINE` is set, else Docker before Podman. */
async function installedContainerEngines(env: NodeJS.ProcessEnv = process.env): Promise<ContainerEngine[]> {
	const requested = requestedContainerEngine(env);
	const candidates = requested ? [requested] : CONTAINER_ENGINES;
	const installed: ContainerEngine[] = [];
	for (const engine of candidates) {
		if (await which(engine, { nothrow: true })) installed.push(engine);
	}
	return installed;
}

/** The first ready engine, else the first installed one so its problem gets reported, else null. */
export async function findContainerEngine(
	env: NodeJS.ProcessEnv = process.env,
): Promise<{ engine: ContainerEngine; ready: boolean } | null> {
	const installed = await installedContainerEngines(env);
	for (const engine of installed) {
		if (await isEngineReady(engine)) return { engine, ready: true };
	}
	return installed[0] ? { engine: installed[0], ready: false } : null;
}

/** Checked on every installed engine: the container may live on Podman while Docker is also on PATH. */
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
			return `Install Docker Engine: ${DOCKER_ENGINE_INSTALL_URL}`;
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

/** For Podman, ready also means its API socket is served: the runtime container mounts it. */
async function isEngineReady(engine: ContainerEngine): Promise<boolean> {
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

/** A tag can be moved to a new build in the registry, so only a digest makes a local copy current for sure. */
export function isDigestPinned(image: string): boolean {
	return image.includes('@');
}

export async function imageExistsLocally(engine: ContainerEngine, image: string): Promise<boolean> {
	try {
		await execa(engine, ['image', 'inspect', image]);
		return true;
	} catch {
		return false;
	}
}

async function isRuntimeContainerRunning(engine: ContainerEngine): Promise<boolean> {
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

/** Reads one `inspect --format '{{json .}}'` payload, in either engine's shape. */
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
 * The engine's API socket as a path on the machine the containers run on, since that machine's engine
 * resolves the bind mount. On macOS and Windows the Docker daemon lives in a VM that serves the default
 * path, and a `DOCKER_HOST` unix socket is a host path a bind mount can't carry into the VM. For Podman,
 * `podman info` reports the served socket as seen from where containers run (rootful, rootless, or a
 * `podman machine` VM alike).
 */
export async function resolveEngineSocketPath(
	engine: ContainerEngine,
	env: NodeJS.ProcessEnv = process.env,
	platform: NodeJS.Platform = process.platform,
): Promise<string> {
	if (engine === 'docker') {
		if (platform !== 'linux') return RUNTIME_SOCKET_PATH;
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

export interface PodmanInfo {
	rootless: boolean;
	/** Enforcing on Fedora and RHEL, and in the Fedora-based VM of `podman machine` (Podman Desktop). */
	selinux: boolean;
	majorVersion?: number;
}

export function parsePodmanInfo(output: string): PodmanInfo {
	const [rootless, selinux, version] = output.trim().split(/\s+/);
	const majorVersion = Number(version?.match(/^(\d+)\./)?.[1]);
	return {
		rootless: rootless === 'true',
		selinux: selinux === 'true',
		...(Number.isInteger(majorVersion) ? { majorVersion } : {}),
	};
}

export async function podmanInfo(): Promise<PodmanInfo | undefined> {
	try {
		const { stdout } = await execa('podman', [
			'info',
			'--format',
			'{{.Host.Security.Rootless}} {{.Host.Security.SELinuxEnabled}} {{.Version.Version}}',
		]);
		return parsePodmanInfo(stdout);
	} catch {
		return undefined;
	}
}

/**
 * The `--network` mode the runtime container needs. Under rootless Podman 3.x the containers run under
 * slirp4netns, which reaches the host's loopback only with this option; the runtime needs that route to
 * reach the web servers of the Actor runs it starts.
 */
export function runtimeNetworkMode(engine: ContainerEngine, podman: PodmanInfo | undefined): string | undefined {
	if (engine !== 'podman' || !podman?.rootless || podman.majorVersion !== 3) return undefined;
	return 'slirp4netns:allow_host_loopback=true';
}

/**
 * The `--security-opt` values the runtime container needs. Under SELinux enforcing, a confined container
 * may not connect to the engine's socket bind-mounted into it (the socket carries the engine's label), so
 * this one container runs unconfined; the Actor containers the runtime starts stay confined. Relabelling
 * the socket (`:z`/`:Z`) would change it for every other client.
 */
export function runtimeSecurityOptions(engine: ContainerEngine, podman: PodmanInfo | undefined): string[] {
	if (engine !== 'podman' || !podman?.selinux) return [];
	return ['label=disable'];
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
	ports?: RuntimePorts;
	platform?: NodeJS.Platform;
	networkMode?: string;
	securityOptions?: string[];
}

export function buildRuntimeRunArgs({
	image,
	dataDir,
	detach,
	hostSocketPath,
	ports = DEFAULT_RUNTIME_PORTS,
	platform = process.platform,
	networkMode,
	securityOptions = [],
}: RuntimeRunArgsOptions): string[] {
	// --init makes signals (Ctrl+C) reach the runtime process even though it runs as the container's PID 1.
	const args = ['run', '--rm', '--init', '--name', ACTOR_RUNTIME_CONTAINER_NAME];

	if (detach) {
		args.push('--detach');
	}

	// The runtime listens on the same number it is published on, since it builds its URLs from it.
	// Defaults are left implicit so older runtime images keep working.
	if (ports.api !== ACTOR_RUNTIME_API_PORT) {
		args.push('-e', `ACTOR_RUNTIME_API_PORT=${ports.api}`);
	}
	if (ports.console !== ACTOR_RUNTIME_CONSOLE_PORT) {
		args.push('-e', `ACTOR_RUNTIME_CONSOLE_PORT=${ports.console}`);
	}
	if (networkMode) {
		args.push('--network', networkMode);
	}
	for (const option of securityOptions) {
		args.push('--security-opt', option);
	}

	args.push(
		'-p',
		`${ports.api}:${ports.api}`,
		'-p',
		`${ports.console}:${ports.console}`,
		'-v',
		socketMountArg(hostSocketPath, platform),
		'-v',
		`${dataDir}:${RUNTIME_DATA_PATH}`,
		image,
	);

	return args;
}

/** Printed wherever the CLI has just given an agent a runtime, since that output is all it reads. */
export function runtimeSkillHintLines(): string[] {
	return [
		`Agents: run 'apify runtime skill --install' to install this runtime's Agent Skill,`,
		`        or 'apify runtime skill' to read it now.`,
	];
}
