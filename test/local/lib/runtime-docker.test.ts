import {
	ACTOR_RUNTIME_CONTAINER_NAME,
	ACTOR_RUNTIME_IMAGE,
	buildRuntimeRunArgs,
	dockerDaemonHint,
	dockerInstallHint,
	dockerSocketMount,
} from '../../../src/lib/runtime/docker.js';

describe('runtime/docker', () => {
	describe('dockerSocketMount()', () => {
		it('uses the plain socket path on Linux and macOS', () => {
			expect(dockerSocketMount('linux')).toBe('/var/run/docker.sock:/var/run/docker.sock');
			expect(dockerSocketMount('darwin')).toBe('/var/run/docker.sock:/var/run/docker.sock');
		});

		it('doubles the leading slash on Windows to prevent path mangling', () => {
			expect(dockerSocketMount('win32')).toBe('//var/run/docker.sock:/var/run/docker.sock');
		});
	});

	describe('install and daemon hints', () => {
		it('points each platform at the right Docker distribution', () => {
			expect(dockerInstallHint('darwin')).toContain('Docker Desktop for Mac');
			expect(dockerInstallHint('win32')).toContain('Docker Desktop for Windows');
			expect(dockerInstallHint('linux')).toContain('Docker Engine');
		});

		it('tells desktop users to start Docker Desktop and Linux users to start the daemon', () => {
			expect(dockerDaemonHint('darwin')).toContain('Docker Desktop');
			expect(dockerDaemonHint('win32')).toContain('Docker Desktop');
			expect(dockerDaemonHint('linux')).toContain('systemctl start docker');
		});
	});

	describe('buildRuntimeRunArgs()', () => {
		it('builds the canonical docker run command', () => {
			expect(buildRuntimeRunArgs({ dataDir: '/home/me/data', detach: false, platform: 'linux' })).toEqual([
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
				ACTOR_RUNTIME_IMAGE,
			]);
		});

		it('adds --detach before the image when requested', () => {
			const args = buildRuntimeRunArgs({ dataDir: '/data', detach: true, platform: 'linux' });
			expect(args).toContain('--detach');
			expect(args.indexOf('--detach')).toBeLessThan(args.indexOf(ACTOR_RUNTIME_IMAGE));
		});
	});
});
