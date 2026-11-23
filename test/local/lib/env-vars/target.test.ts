import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { resolveEnvTarget, versionClientFor } from '../../../../src/lib/env-vars/target.js';
import { getCurrentUserInfo, getLoggedClientOrThrow } from '../../../../src/lib/utils.js';
import { resetCwdCaches } from '../../../__setup__/reset-cwd-caches.js';

vitest.mock('../../../../src/lib/utils.js', async (importOriginal) => {
	const { envPlatform } = await import('../../../__setup__/env-platform-mock.js');
	return {
		...(await importOriginal<typeof import('../../../../src/lib/utils.js')>()),
		getLoggedClientOrThrow: vitest.fn(async () => envPlatform.client),
		getCurrentUserInfo: vitest.fn(async () => envPlatform.state.user),
	};
});

const { envPlatform } = await import('../../../__setup__/env-platform-mock.js');

let root: string;
let originalExitCode: typeof process.exitCode;

const writeActorJson = (dir: string, config: Record<string, unknown>) => {
	mkdirSync(join(dir, '.actor'), { recursive: true });
	writeFileSync(join(dir, '.actor', 'actor.json'), JSON.stringify({ actorSpecification: 1, ...config }));
};

const expectFailure = async (promise: Promise<unknown>, message: string | RegExp, exitCode: number) => {
	await expect(promise).rejects.toThrow(message);
	expect(process.exitCode).toBe(exitCode);
};

beforeEach(() => {
	originalExitCode = process.exitCode;
	process.exitCode = undefined;
	root = mkdtempSync(join(tmpdir(), 'env-target-test-'));
	resetCwdCaches();
	vitest.mocked(getLoggedClientOrThrow).mockClear();
	vitest.mocked(getCurrentUserInfo).mockClear();
	envPlatform.reset();
	envPlatform.state.actors.push(
		{
			id: 'actor-1',
			username: 'tester',
			name: 'my-actor',
			versions: [
				{ versionNumber: '0.0', envVars: [] },
				{ versionNumber: '1.2', envVars: [] },
			],
		},
		{ id: 'actor-2', username: 'someone', name: 'shared-actor', versions: [{ versionNumber: '0.0', envVars: [] }] },
		{ id: 'actor-3', username: 'tester', name: 'empty-actor', versions: [] },
	);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
	process.exitCode = originalExitCode;
});

describe('resolveEnvTarget', () => {
	it('takes the Actor and version from .actor/actor.json', async () => {
		writeActorJson(root, { name: 'my-actor', version: '1.2' });

		const target = await resolveEnvTarget({ dir: root });

		expect(target).toMatchObject({
			actorDir: root,
			actor: { id: 'actor-1', username: 'tester', name: 'my-actor' },
			actorLabel: 'tester/my-actor',
			versionNumber: '1.2',
			versionSource: 'actor.json',
			actorConfig: { name: 'my-actor', version: '1.2' },
		});
		expect(target.client).toBe(envPlatform.client);
	});

	it('picks an Actor folder in a monorepo with --dir', async () => {
		writeActorJson(join(root, 'actors', 'a'), { name: 'my-actor', version: '0.0' });

		const target = await resolveEnvTarget({ dir: join(root, 'actors', 'a') });

		expect(target.actorDir).toBe(join(root, 'actors', 'a'));
		expect(target.actor.id).toBe('actor-1');
	});

	it('resolves a relative --dir against the current directory', async () => {
		writeActorJson(join(root, 'actors', 'a'), { name: 'my-actor', version: '1.2' });
		vitest.spyOn(process, 'cwd').mockReturnValue(root);

		const target = await resolveEnvTarget({ dir: join('actors', 'a') });

		expect(target.actorDir).toBe(join(root, 'actors', 'a'));
		expect(target.actor.id).toBe('actor-1');
		expect(target.versionNumber).toBe('1.2');
	});

	it('prefers --version over actor.json', async () => {
		writeActorJson(root, { name: 'my-actor', version: '1.2' });

		const target = await resolveEnvTarget({ dir: root, version: '0.0' });

		expect(target.versionNumber).toBe('0.0');
		expect(target.versionSource).toBe('flag');
	});

	it('defaults to version 0.0 when actor.json has none', async () => {
		writeActorJson(root, { name: 'my-actor' });

		const target = await resolveEnvTarget({ dir: root });

		expect(target.versionNumber).toBe('0.0');
		expect(target.versionSource).toBe('default');
	});

	it('ignores a "version" that is not a string, as in a legacy apify.json', async () => {
		writeFileSync(join(root, 'apify.json'), JSON.stringify({ name: 'my-actor', version: { versionNumber: '1.2' } }));

		const target = await resolveEnvTarget({ dir: root });

		expect(target.versionNumber).toBe('0.0');
		expect(target.versionSource).toBe('default');
	});

	it('finds an Actor by ID with --actor', async () => {
		const target = await resolveEnvTarget({ dir: root, actor: 'actor-2' });

		expect(target.actorLabel).toBe('someone/shared-actor');
		expect(target.versionSource).toBe('default');
		expect(target.actorConfig).toBeUndefined();
	});

	it('finds an Actor by username/name with --actor', async () => {
		const target = await resolveEnvTarget({ dir: root, actor: 'someone/shared-actor' });

		expect(target.actor.id).toBe('actor-2');
		expect(getCurrentUserInfo).not.toHaveBeenCalled();
	});

	it('finds an Actor of the logged-in user by a bare name with --actor, lowercased', async () => {
		const target = await resolveEnvTarget({ dir: root, actor: 'My-Actor', version: '1.2' });

		expect(target.actor.id).toBe('actor-1');
		expect(target.versionNumber).toBe('1.2');
		expect(target.versionSource).toBe('flag');
	});

	it('ignores the local actor.json with --actor, also for the version', async () => {
		writeActorJson(root, { name: 'my-actor', version: '1.2' });

		const target = await resolveEnvTarget({ dir: root, actor: 'someone/shared-actor' });

		expect(target.actor.id).toBe('actor-2');
		expect(target.versionNumber).toBe('0.0');
		expect(target.actorConfig).toBeUndefined();
	});

	it('works with --actor when the directory holds no Actor', async () => {
		const target = await resolveEnvTarget({ actor: 'actor-1' });

		expect(target.actorDir).toBe(process.cwd());
	});

	it('returns a version client for the target', async () => {
		envPlatform.state.actors[0].versions[1].envVars.push({ name: 'A', value: 'a' });
		writeActorJson(root, { name: 'my-actor', version: '1.2' });

		const target = await resolveEnvTarget({ dir: root });

		await expect(versionClientFor(target).envVars().list()).resolves.toMatchObject({ total: 1 });
	});

	describe('errors', () => {
		it.each([
			['no Actor', () => undefined],
			['actor.json without a name', () => writeActorJson(root, { version: '0.0' })],
			[
				'an unreadable actor.json',
				() => {
					mkdirSync(join(root, '.actor'));
					writeFileSync(join(root, '.actor', 'actor.json'), '{ not json');
				},
			],
		])('fails on %s before logging in', async (_, setUp) => {
			setUp();

			await expect(resolveEnvTarget({ dir: root })).rejects.toThrow();
			expect(process.exitCode).toBe(5);
			expect(getLoggedClientOrThrow).not.toHaveBeenCalled();
		});

		it('fails when --dir does not exist', async () => {
			const dir = join(root, 'missing');

			await expectFailure(resolveEnvTarget({ dir }), `Directory ${dir} doesn't exist.`, 5);
		});

		it('fails when --dir is a file', async () => {
			writeFileSync(join(root, 'file'), '');

			await expectFailure(resolveEnvTarget({ dir: join(root, 'file') }), "doesn't exist.", 5);
		});

		it('fails without an Actor and without --actor', async () => {
			await expectFailure(
				resolveEnvTarget({ dir: root }),
				`No Actor found in ${root}. Run the command in an Actor directory, pass --dir <path>, or pass --actor <ID or username/name>.`,
				5,
			);
		});

		it('lists the Actor folders below a monorepo root', async () => {
			writeActorJson(join(root, 'actors', 'a'), { name: 'a' });
			writeActorJson(join(root, 'actors', 'b'), { name: 'b' });

			const promise = resolveEnvTarget({ dir: root });

			await expectFailure(promise, /This directory has no Actor of its own\. Pass --dir with one of: /, 5);
			await expect(promise).rejects.toThrow(/actors\/a, .*actors\/b$/);
		});

		it('fails when actor.json cannot be parsed', async () => {
			mkdirSync(join(root, '.actor'));
			writeFileSync(join(root, '.actor', 'actor.json'), '{ not json');

			await expectFailure(resolveEnvTarget({ dir: root }), /Failed to read local config/, 5);
		});

		it('fails when actor.json has no name', async () => {
			writeActorJson(root, { version: '0.0' });

			await expectFailure(
				resolveEnvTarget({ dir: root }),
				'.actor/actor.json has no "name". Add it, or pass --actor <ID or username/name>.',
				5,
			);
		});

		it('fails when the Actor from actor.json does not exist', async () => {
			writeActorJson(root, { name: 'unknown-actor' });

			await expectFailure(
				resolveEnvTarget({ dir: root }),
				"Actor tester/unknown-actor doesn't exist on the Apify platform. Run apify push to create it, or pass --actor <ID or username/name>.",
				250,
			);
		});

		it('fails when the --actor Actor does not exist', async () => {
			await expectFailure(
				resolveEnvTarget({ dir: root, actor: 'nobody/nothing' }),
				`Actor "nobody/nothing" doesn't exist, or your account can't access it.`,
				250,
			);
		});

		it('fails when the version does not exist and lists the versions', async () => {
			await expectFailure(
				resolveEnvTarget({ dir: root, actor: 'actor-1', version: '9.9' }),
				"Version 9.9 doesn't exist on Actor tester/my-actor. Its versions: 0.0, 1.2. Pass --version <number>.",
				250,
			);
		});

		it('says when the version came from actor.json', async () => {
			writeActorJson(root, { name: 'my-actor', version: '2.0' });

			await expectFailure(
				resolveEnvTarget({ dir: root }),
				"Version 2.0 doesn't exist on Actor tester/my-actor (taken from .actor/actor.json). Its versions: 0.0, 1.2. Pass --version <number>.",
				250,
			);
		});

		it('says when the Actor has no versions', async () => {
			await expectFailure(
				resolveEnvTarget({ dir: root, actor: 'empty-actor' }),
				"Version 0.0 doesn't exist on Actor tester/empty-actor. The Actor has no versions. Pass --version <number>.",
				250,
			);
		});
	});
});
