import {
	ACTOR_RUNTIME_CONTAINER_NAME,
	buildRuntimeRunArgs,
	DEFAULT_ACTOR_RUNTIME_IMAGE,
	engineDaemonHint,
	engineInstallHint,
	parseRuntimeContainerInfo,
	requestedContainerEngine,
	resolveEngineSocketPath,
	socketMountArg,
} from '../../../src/lib/runtime/docker.js';

describe('runtime/docker', () => {
	describe('socketMountArg()', () => {
		it('mounts the host socket at the path the runtime expects, on Linux and macOS', () => {
			expect(socketMountArg('/var/run/docker.sock', 'linux')).toBe('/var/run/docker.sock:/var/run/docker.sock');
			expect(socketMountArg('/run/podman/podman.sock', 'darwin')).toBe('/run/podman/podman.sock:/var/run/docker.sock');
		});

		it('doubles the leading slash on Windows to prevent path mangling', () => {
			expect(socketMountArg('/var/run/docker.sock', 'win32')).toBe('//var/run/docker.sock:/var/run/docker.sock');
		});
	});

	describe('requestedContainerEngine()', () => {
		it('reads APIFY_CONTAINER_ENGINE case-insensitively and ignores anything but docker or podman', () => {
			expect(requestedContainerEngine({ APIFY_CONTAINER_ENGINE: 'podman' })).toBe('podman');
			expect(requestedContainerEngine({ APIFY_CONTAINER_ENGINE: ' Docker ' })).toBe('docker');
			expect(requestedContainerEngine({ APIFY_CONTAINER_ENGINE: 'nerdctl' })).toBeUndefined();
			expect(requestedContainerEngine({})).toBeUndefined();
		});
	});

	describe('resolveEngineSocketPath()', () => {
		it('uses the default Docker socket unless DOCKER_HOST names a unix socket (rootless Docker)', async () => {
			await expect(resolveEngineSocketPath('docker', {})).resolves.toBe('/var/run/docker.sock');
			await expect(
				resolveEngineSocketPath('docker', { DOCKER_HOST: 'unix:///run/user/1000/docker.sock' }),
			).resolves.toBe('/run/user/1000/docker.sock');
			await expect(resolveEngineSocketPath('docker', { DOCKER_HOST: 'tcp://localhost:2375' })).resolves.toBe(
				'/var/run/docker.sock',
			);
		});
	});

	describe('install and daemon hints', () => {
		it('points each platform at the right Docker distribution', () => {
			expect(engineInstallHint('docker', 'darwin')).toContain('Docker Desktop for Mac');
			expect(engineInstallHint('docker', 'win32')).toContain('Docker Desktop for Windows');
			expect(engineInstallHint('docker', 'linux')).toContain('Docker Engine');
		});

		it('points Podman users at the Podman installation docs on every platform', () => {
			for (const platform of ['darwin', 'win32', 'linux'] as const) {
				expect(engineInstallHint('podman', platform)).toContain('podman.io');
			}
		});

		it('tells desktop users to start Docker Desktop and Linux users to start the daemon', () => {
			expect(engineDaemonHint('docker', 'darwin')).toContain('Docker Desktop');
			expect(engineDaemonHint('docker', 'win32')).toContain('Docker Desktop');
			expect(engineDaemonHint('docker', 'linux')).toContain('systemctl start docker');
		});

		it('tells Podman users to serve the API socket on Linux and to start the machine on desktops', () => {
			expect(engineDaemonHint('podman', 'linux')).toContain('podman.socket');
			expect(engineDaemonHint('podman', 'linux')).toContain('podman system service');
			expect(engineDaemonHint('podman', 'darwin')).toContain('podman machine start');
			expect(engineDaemonHint('podman', 'win32')).toContain('podman machine start');
		});
	});

	describe('parseRuntimeContainerInfo()', () => {
		it("reads the image, data directory and published ports out of either engine's inspect payload", () => {
			expect(
				parseRuntimeContainerInfo(
					'docker',
					JSON.stringify({
						Config: { Image: 'apify/actor-runtime:latest' },
						State: { Status: 'running', StartedAt: '2026-09-11T08:00:00Z' },
						Mounts: [
							{ Destination: '/var/run/docker.sock', Source: '/var/run/docker.sock' },
							{ Destination: '/data', Source: '/home/me/.apify/actor-runtime/data' },
						],
						NetworkSettings: {
							Ports: {
								'3000/tcp': [{ HostIp: '0.0.0.0', HostPort: '3000' }],
								'3333/tcp': [{ HostIp: '127.0.0.1', HostPort: '3333' }],
							},
						},
					}),
				),
			).toEqual({
				engine: 'docker',
				image: 'apify/actor-runtime:latest',
				status: 'running',
				startedAt: '2026-09-11T08:00:00Z',
				dataDir: '/home/me/.apify/actor-runtime/data',
				ports: [
					{ containerPort: 3000, protocol: 'tcp', hostAddress: '0.0.0.0:3000' },
					{ containerPort: 3333, protocol: 'tcp', hostAddress: '127.0.0.1:3333' },
				],
			});

			// Podman names the image at the top level and can report the bindings under HostConfig.
			expect(
				parseRuntimeContainerInfo(
					'podman',
					JSON.stringify({
						ImageName: 'docker.io/apify/actor-runtime:latest',
						State: { Status: 'running' },
						Mounts: [{ Destination: '/data', Source: '/home/me/data' }],
						HostConfig: { PortBindings: { '3333/tcp': [{ HostIp: '', HostPort: '3333' }] } },
					}),
				),
			).toMatchObject({
				image: 'docker.io/apify/actor-runtime:latest',
				dataDir: '/home/me/data',
				ports: [{ containerPort: 3333, protocol: 'tcp', hostAddress: '0.0.0.0:3333' }],
			});

			expect(parseRuntimeContainerInfo('docker', 'not json')).toBeNull();
		});
	});

	describe('buildRuntimeRunArgs()', () => {
		it('builds the canonical run command around the resolved host socket', () => {
			expect(
				buildRuntimeRunArgs({
					image: DEFAULT_ACTOR_RUNTIME_IMAGE,
					dataDir: '/home/me/data',
					detach: false,
					hostSocketPath: '/var/run/docker.sock',
					platform: 'linux',
				}),
			).toEqual([
				'run',
				'--rm',
				'--init',
				'--name',
				ACTOR_RUNTIME_CONTAINER_NAME,
				'-p',
				'3333:3333',
				'-p',
				'3000:3000',
				'-v',
				'/var/run/docker.sock:/var/run/docker.sock',
				'-v',
				'/home/me/data:/data',
				DEFAULT_ACTOR_RUNTIME_IMAGE,
			]);
		});

		it("mounts a rootless Podman socket at the runtime's expected path", () => {
			const args = buildRuntimeRunArgs({
				image: DEFAULT_ACTOR_RUNTIME_IMAGE,
				dataDir: '/data',
				detach: false,
				hostSocketPath: '/run/user/1000/podman/podman.sock',
				platform: 'linux',
			});
			expect(args).toContain('/run/user/1000/podman/podman.sock:/var/run/docker.sock');
		});

		it('adds --detach before the image when requested', () => {
			const args = buildRuntimeRunArgs({
				image: DEFAULT_ACTOR_RUNTIME_IMAGE,
				dataDir: '/data',
				detach: true,
				hostSocketPath: '/var/run/docker.sock',
				platform: 'linux',
			});
			expect(args).toContain('--detach');
			expect(args.indexOf('--detach')).toBeLessThan(args.indexOf(DEFAULT_ACTOR_RUNTIME_IMAGE));
		});
	});
});
