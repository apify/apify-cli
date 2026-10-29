import {
	ACTOR_RUNTIME_CONTAINER_NAME,
	buildRuntimeRunArgs,
	DEFAULT_ACTOR_RUNTIME_IMAGE,
	parsePodmanInfo,
	runtimeNetworkMode,
	runtimeSecurityOptions,
	isDigestPinned,
	parseRuntimeContainerInfo,
	requestedContainerEngine,
	resolveEngineSocketPath,
	socketMountArg,
} from '../../../src/lib/runtime/docker.js';

describe('runtime/docker', () => {
	describe('socketMountArg()', () => {
		it('mounts the host socket at the path the runtime expects', () => {
			expect(socketMountArg('/run/podman/podman.sock', 'linux')).toBe('/run/podman/podman.sock:/var/run/docker.sock');
		});

		it('doubles the leading slash on Windows to prevent path mangling', () => {
			expect(socketMountArg('/var/run/docker.sock', 'win32')).toBe('//var/run/docker.sock:/var/run/docker.sock');
		});
	});

	describe('isDigestPinned()', () => {
		it('only treats digest references as fixed', () => {
			expect(isDigestPinned('apify/actor-runtime@sha256:abc')).toBe(true);
			expect(isDigestPinned(DEFAULT_ACTOR_RUNTIME_IMAGE)).toBe(false);
			expect(isDigestPinned('apify/actor-runtime:master-5462005')).toBe(false);
		});
	});

	describe('requestedContainerEngine()', () => {
		it('reads APIFY_CONTAINER_ENGINE case-insensitively and ignores anything but docker or podman', () => {
			expect(requestedContainerEngine({ APIFY_CONTAINER_ENGINE: ' Docker ' })).toBe('docker');
			expect(requestedContainerEngine({ APIFY_CONTAINER_ENGINE: 'nerdctl' })).toBeUndefined();
			expect(requestedContainerEngine({})).toBeUndefined();
		});
	});

	describe('resolveEngineSocketPath()', () => {
		it('uses the default Docker socket unless DOCKER_HOST names a unix socket on Linux', async () => {
			await expect(resolveEngineSocketPath('docker', {}, 'linux')).resolves.toBe('/var/run/docker.sock');
			await expect(
				resolveEngineSocketPath('docker', { DOCKER_HOST: 'unix:///run/user/1000/docker.sock' }, 'linux'),
			).resolves.toBe('/run/user/1000/docker.sock');
			await expect(resolveEngineSocketPath('docker', { DOCKER_HOST: 'tcp://localhost:2375' }, 'linux')).resolves.toBe(
				'/var/run/docker.sock',
			);
		});

		it('ignores a DOCKER_HOST unix socket on macOS and Windows, where the daemon lives in a VM', async () => {
			await expect(
				resolveEngineSocketPath('docker', { DOCKER_HOST: 'unix:///Users/me/.colima/default/docker.sock' }, 'darwin'),
			).resolves.toBe('/var/run/docker.sock');
			await expect(
				resolveEngineSocketPath('docker', { DOCKER_HOST: 'unix:///run/user/1000/docker.sock' }, 'win32'),
			).resolves.toBe('/var/run/docker.sock');
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
		const defaults = {
			image: DEFAULT_ACTOR_RUNTIME_IMAGE,
			dataDir: '/home/me/data',
			detach: false,
			hostSocketPath: '/var/run/docker.sock',
			platform: 'linux' as const,
		};

		it('builds the canonical run command around the resolved host socket', () => {
			expect(buildRuntimeRunArgs(defaults)).toEqual([
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

		it('puts --detach, moved ports, network mode and security options before the image', () => {
			const args = buildRuntimeRunArgs({
				...defaults,
				detach: true,
				ports: { api: 3333, console: 4000 },
				networkMode: 'slirp4netns:allow_host_loopback=true',
				securityOptions: ['label=disable'],
			});

			expect(args.slice(5, -1).join(' ')).toBe(
				'--detach -e ACTOR_RUNTIME_CONSOLE_PORT=4000 --network slirp4netns:allow_host_loopback=true --security-opt label=disable ' +
					'-p 3333:3333 -p 4000:4000 -v /var/run/docker.sock:/var/run/docker.sock -v /home/me/data:/data',
			);
		});
	});

	describe('Podman-specific options', () => {
		it('gives the runtime container a route to the host loopback on rootless Podman 3.x only', () => {
			const podman3 = parsePodmanInfo('true false 3.4.4\n');
			expect(podman3).toEqual({ rootless: true, selinux: false, majorVersion: 3 });
			expect(runtimeNetworkMode('podman', podman3)).toBe('slirp4netns:allow_host_loopback=true');
			expect(runtimeNetworkMode('podman', parsePodmanInfo('false false 3.4.4'))).toBeUndefined();
			expect(runtimeNetworkMode('podman', parsePodmanInfo('true false 4.9.3'))).toBeUndefined();
			expect(runtimeNetworkMode('podman', undefined)).toBeUndefined();
			expect(runtimeNetworkMode('docker', podman3)).toBeUndefined();
		});

		it('runs the runtime container unconfined where Podman reports SELinux enforcing only', () => {
			const fedora = parsePodmanInfo('true true 5.4.0\n');
			expect(runtimeSecurityOptions('podman', fedora)).toEqual(['label=disable']);
			expect(runtimeSecurityOptions('podman', parsePodmanInfo('true false 5.4.0'))).toEqual([]);
			expect(runtimeSecurityOptions('podman', undefined)).toEqual([]);
			expect(runtimeSecurityOptions('docker', fedora)).toEqual([]);
		});
	});
});
