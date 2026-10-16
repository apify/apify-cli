import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { CommandExitCodes, LOCAL_CONFIG_PATH } from '../../../src/lib/consts.js';
import { cwdCache } from '../../../src/lib/hooks/useActorConfig.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

// Whether the terminal is interactive is decided by `useStdin` and `ci-info`; both are under test control.
const stdinState = vitest.hoisted(() => ({ isTTY: false }));
vitest.mock('../../../src/lib/hooks/useStdin.js', () => ({
	useStdin: async () => ({ isTTY: stdinState.isTTY, hasData: false, waitDelay: 0 }),
}));
vitest.mock('ci-info', async (importOriginal) => {
	const original = await importOriginal<typeof import('ci-info')>();
	return { ...original, isCI: false };
});

const multiSelect = vitest.hoisted(() => vitest.fn());
vitest.mock('../../../src/lib/hooks/user-confirmations/useMultiSelectFromList.js', () => ({
	useMultiSelectFromList: multiSelect,
}));

interface PlatformActor {
	id: string;
	name: string;
	modifiedAt: Date;
}

const ACTOR_A = { id: 'actorIdAAAAAAAAA', name: 'actor-a', modifiedAt: new Date(0) };
const ACTOR_B = { id: 'actorIdBBBBBBBBB', name: 'actor-b', modifiedAt: new Date(0) };
const ACTOR_C = { id: 'actorIdCCCCCCCCC', name: 'actor-c', modifiedAt: new Date(0) };

// Hoisted so the `vitest.mock` factory below can reach it: the Actors on the platform, the status each
// build ends with, and every version write with its Actor.
const platform = vitest.hoisted(() => {
	const state = {
		actors: [] as { id: string; name: string; modifiedAt: Date }[],
		buildStatuses: {} as Record<string, string>,
	};

	const buildFor = (actorId: string) => ({
		id: `build-${actorId}`,
		actId: actorId,
		buildNumber: '0.0.1',
		status: state.buildStatuses[actorId] ?? 'SUCCEEDED',
	});

	const versionUpdate = vitest.fn(async (_actorId: string, _version: string, _modifier: unknown) => ({}));

	const getLoggedClientOrThrow = vitest.fn(async () => ({
		baseUrl: 'https://api.apify.com/v2',
		actor: (idOrName: string) => {
			const actor = state.actors.find(
				(candidate) => candidate.id === idOrName || idOrName.endsWith(`/${candidate.name}`),
			);
			return {
				get: async () =>
					actor && {
						...actor,
						taggedBuilds: { latest: { buildId: `build-${actor.id}` }, beta: { buildId: `build-${actor.id}` } },
					},
				version: (version: string) => ({
					get: async () => ({ versionNumber: version, sourceType: 'SOURCE_FILES' }),
					update: async (modifier: unknown) => versionUpdate(actor!.id, version, modifier),
				}),
				build: async () => buildFor(actor!.id),
			};
		},
		build: (buildId: string) => ({ get: async () => buildFor(buildId.replace('build-', '')) }),
		log: () => ({ get: async () => 'npm ERR! boom\n' }),
	}));

	return { state, versionUpdate, getLoggedClientOrThrow };
});

const { versionUpdate, getLoggedClientOrThrow } = platform;

// Stands in for the platform: three Actors exist, and every version write is recorded with its Actor.
vitest.mock('../../../src/lib/utils.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/utils.js')>()),
	getCurrentUserInfo: vitest.fn(async () => ({ id: 'userId', username: 'user' })),
	outputJobLog: vitest.fn(async () => {}),
	getLoggedClientOrThrow: platform.getLoggedClientOrThrow,
}));

// The mocked `node:process` copy has no signal handlers; nothing here needs them.
vitest.mock('../../../src/lib/hooks/useAbortJobOnSignal.js', () => ({
	useAbortJobOnSignal: () => ({ [Symbol.dispose]() {} }),
}));

const { beforeAllCalls, afterAllCalls, joinPath, forceNewCwd } = useTempPath('push-select-root', {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { logMessages } = useConsoleSpy();

const { ActorsPushCommand } = await import('../../../src/commands/actors/push.js');
// The command sets the exit code on this mocked copy of `node:process`, not on the global one.
const { default: commandProcess } = await import('node:process');

async function write(relativePath: string, content: string) {
	await mkdir(dirname(joinPath(relativePath)), { recursive: true });
	await writeFile(joinPath(relativePath), content);
}

async function writeActor(dir: string, name: string) {
	await write(
		`${dir}/${LOCAL_CONFIG_PATH}`,
		JSON.stringify({ actorSpecification: 1, name, version: '0.0', buildTag: 'latest' }),
	);
	await write(`${dir}/src/main.js`, `console.log("${name}")`);
}

const run = (argsFlags: Parameters<typeof testRunCommand<typeof ActorsPushCommand>>[1] = {}) =>
	testRunCommand(ActorsPushCommand, argsFlags);

const stderr = () => logMessages.error.join('\n');
const stdoutJson = () => {
	expect(logMessages.log).toHaveLength(1);
	return JSON.parse(logMessages.log[0]);
};
const pushedActorIds = () => versionUpdate.mock.calls.map(([actorId]) => actorId);

let originalExitCode: typeof process.exitCode;

beforeEach(async () => {
	originalExitCode = commandProcess.exitCode;
	stdinState.isTTY = false;
	platform.state.actors = [ACTOR_A, ACTOR_B, ACTOR_C];
	platform.state.buildStatuses = {};
	versionUpdate.mockClear();
	getLoggedClientOrThrow.mockClear();
	multiSelect.mockReset();
	cwdCache.clear();
	await beforeAllCalls();

	// A repository with Actors in subfolders, shared code beside them, and an ignored copy of an Actor.
	await write('package.json', '{"workspaces":["actors/*"]}');
	await write('packages/shared/index.js', 'module.exports = {};');
	await writeActor('actors/b', ACTOR_B.name);
	await writeActor('actors/a', ACTOR_A.name);
	await writeActor('tools/c', ACTOR_C.name);
	await writeActor('node_modules/dep', 'ignored-dep');
});

afterEach(async () => {
	commandProcess.exitCode = originalExitCode;
	await afterAllCalls();
});

describe('apify push in a repository with several Actors', () => {
	describe('choosing what to push', () => {
		it('lists the Actors and exits 4 without calling the API when it cannot ask', async () => {
			await run();

			expect(commandProcess.exitCode).toBe(CommandExitCodes.NoFilesToPush);
			expect(getLoggedClientOrThrow).not.toHaveBeenCalled();
			expect(versionUpdate).not.toHaveBeenCalled();
			expect(logMessages.log).toEqual([]);
			const output = stderr();
			expect(output).toContain('actors/a (actor-a)');
			expect(output).toContain('actors/b (actor-b)');
			expect(output).toContain('tools/c (actor-c)');
			expect(output).not.toContain('node_modules');
			expect(output).toContain('Choose what to push: --all, or --actor-dir <path> for each Actor.');
			expect(output.indexOf('actors/a')).toBeLessThan(output.indexOf('actors/b'));
			expect(output.indexOf('actors/b')).toBeLessThan(output.indexOf('tools/c'));
		});

		it('exits 4 with a single Actor below too, instead of guessing', async () => {
			await writeActor('single/one', ACTOR_A.name);
			forceNewCwd('single');

			await run();

			expect(commandProcess.exitCode).toBe(CommandExitCodes.NoFilesToPush);
			expect(stderr()).toContain('one (actor-a)');
			expect(getLoggedClientOrThrow).not.toHaveBeenCalled();
		});

		it('keeps the exit-4 error for a directory with no Actors anywhere below it', async () => {
			forceNewCwd('packages');
			await run();

			expect(commandProcess.exitCode).toBe(CommandExitCodes.NoFilesToPush);
			expect(stderr()).toContain('A valid Actor could not be found in the current directory.');
			expect(stderr()).not.toContain('Choose what to push');
			expect(getLoggedClientOrThrow).not.toHaveBeenCalled();
		});

		it('rejects an --actor-dir without an actor.json before the login check', async () => {
			await run({ flags_actorDir: ['actors/a', 'packages/shared'] });

			expect(commandProcess.exitCode).toBe(CommandExitCodes.NoFilesToPush);
			expect(stderr()).toContain('Directory "packages/shared" from --actor-dir has no .actor/actor.json.');
			expect(getLoggedClientOrThrow).not.toHaveBeenCalled();
			expect(versionUpdate).not.toHaveBeenCalled();
		});

		it('rejects the actorId argument when more than one Actor is selected', async () => {
			await run({ args_actorId: ACTOR_A.id, flags_all: true });

			expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidInput);
			expect(stderr()).toContain('actorId argument applies to a single Actor');
			expect(getLoggedClientOrThrow).not.toHaveBeenCalled();
		});

		it('pushes to the actorId argument when exactly one Actor is selected', async () => {
			await run({ args_actorId: ACTOR_C.id, flags_actorDir: ['actors/a'] });

			expect(commandProcess.exitCode).toBeFalsy();
			expect(pushedActorIds()).toEqual([ACTOR_C.id]);
		});
	});

	describe('pushing the selection', () => {
		it('pushes every Actor in path order with --all', async () => {
			await run({ flags_all: true });

			expect(commandProcess.exitCode).toBeFalsy();
			expect(pushedActorIds()).toEqual([ACTOR_A.id, ACTOR_B.id, ACTOR_C.id]);
			const files = versionUpdate.mock.calls.map(([, , modifier]) =>
				(modifier as { sourceFiles: { name: string }[] }).sourceFiles.map((file) => file.name).sort(),
			);
			expect(files).toEqual([
				['.actor/actor.json', 'src/main.js'],
				['.actor/actor.json', 'src/main.js'],
				['.actor/actor.json', 'src/main.js'],
			]);
			expect(logMessages.log.join('\n')).toContain('Apify push result: SUCCEEDED');
		});

		it('pushes the --actor-dir directories, normalized and without duplicates', async () => {
			await run({ flags_actorDir: ['./tools/c/', 'actors/a', 'tools/c'] });

			expect(commandProcess.exitCode).toBeFalsy();
			expect(pushedActorIds()).toEqual([ACTOR_C.id, ACTOR_A.id]);
		});

		it('passes --version and --build-tag to every version payload', async () => {
			await run({ flags_all: true, flags_version: '1.5', flags_buildTag: 'beta' });

			expect(commandProcess.exitCode).toBeFalsy();
			expect(versionUpdate.mock.calls.map(([, version]) => version)).toEqual(['1.5', '1.5', '1.5']);
			for (const [, , modifier] of versionUpdate.mock.calls) {
				expect(modifier).toMatchObject({ buildTag: 'beta' });
			}
		});

		it("keeps going after a failed build and exits with that build's code", async () => {
			platform.state.buildStatuses[ACTOR_A.id] = 'FAILED';

			await run({ flags_all: true, flags_json: true });

			expect(commandProcess.exitCode).toBe(CommandExitCodes.BuildFailed);
			expect(pushedActorIds()).toEqual([ACTOR_A.id, ACTOR_B.id, ACTOR_C.id]);
			const summary = stdoutJson();
			expect(summary).toMatchObject({ ok: false, operation: 'push', exitCode: CommandExitCodes.BuildFailed });
			expect(
				summary.results.map((entry: { dir: string; ok: boolean; exitCode?: number }) => [
					entry.dir,
					entry.ok,
					entry.exitCode,
				]),
			).toEqual([
				['actors/a', false, CommandExitCodes.BuildFailed],
				['actors/b', true, 0],
				['tools/c', true, 0],
			]);
			expect(summary.results[0].error).toMatchObject({ phase: 'build', message: 'Build failed' });
		});

		it('keeps going after an Actor that stops before the build, with the first failure as the exit code', async () => {
			platform.state.buildStatuses[ACTOR_C.id] = 'TIMED-OUT';
			platform.state.actors = [{ ...ACTOR_A, modifiedAt: new Date(Date.now() + 60 * 60 * 1000) }, ACTOR_B, ACTOR_C];

			await run({ flags_all: true, flags_json: true });

			expect(commandProcess.exitCode).toBe(1);
			expect(pushedActorIds()).toEqual([ACTOR_B.id, ACTOR_C.id]);
			expect(stderr()).toContain('has newer changes than your local copy');
			const summary = stdoutJson();
			expect(summary.exitCode).toBe(1);
			expect(summary.results[0]).toEqual({ dir: 'actors/a', ok: false, exitCode: 1 });
			expect(summary.results[2]).toMatchObject({ dir: 'tools/c', ok: false, exitCode: CommandExitCodes.BuildTimedOut });
		});
	});

	describe('--json', () => {
		it('prints one document with an entry per Actor and nothing else on stdout', async () => {
			await run({ flags_all: true, flags_json: true });

			expect(commandProcess.exitCode).toBeFalsy();
			const summary = stdoutJson();
			expect(Object.keys(summary)).toEqual(['ok', 'operation', 'results', 'exitCode']);
			expect(summary).toMatchObject({ ok: true, operation: 'push', exitCode: 0 });
			expect(summary.results).toHaveLength(3);
			expect(summary.results[0]).toEqual({
				dir: 'actors/a',
				ok: true,
				operation: 'push',
				actor: { id: ACTOR_A.id, url: expect.stringContaining(ACTOR_A.id) },
				build: {
					id: `build-${ACTOR_A.id}`,
					number: '0.0.1',
					status: 'SUCCEEDED',
					url: expect.stringContaining('#/builds/0.0.1'),
				},
				exitCode: 0,
			});
		});

		it('wraps even a single --actor-dir push in the results document', async () => {
			await run({ flags_actorDir: ['actors/b'], flags_json: true });

			const summary = stdoutJson();
			expect(summary.results).toEqual([expect.objectContaining({ dir: 'actors/b', ok: true })]);
		});

		it('prints nothing on stdout when it cannot ask', async () => {
			await run({ flags_json: true });

			expect(commandProcess.exitCode).toBe(CommandExitCodes.NoFilesToPush);
			expect(logMessages.log).toEqual([]);
		});

		it('leaves the single-Actor envelope unchanged in an Actor directory', async () => {
			forceNewCwd('actors/a');

			await run({ flags_json: true });

			expect(commandProcess.exitCode).toBeFalsy();
			expect(stdoutJson()).toEqual({
				ok: true,
				operation: 'push',
				actor: { id: ACTOR_A.id, url: expect.stringContaining(ACTOR_A.id) },
				build: {
					id: `build-${ACTOR_A.id}`,
					number: '0.0.1',
					status: 'SUCCEEDED',
					url: expect.stringContaining('#/builds/0.0.1'),
				},
				exitCode: 0,
			});
		});
	});

	describe('the interactive prompt', () => {
		beforeEach(() => {
			stdinState.isTTY = true;
		});

		it('offers every Actor with its name and pushes the chosen ones', async () => {
			multiSelect.mockResolvedValueOnce(['tools/c']);

			await run();

			expect(commandProcess.exitCode).toBeFalsy();
			expect(multiSelect).toHaveBeenCalledTimes(1);
			expect(multiSelect.mock.calls[0][0]).toMatchObject({
				choices: [
					{ name: 'actors/a (actor-a)', value: 'actors/a' },
					{ name: 'actors/b (actor-b)', value: 'actors/b' },
					{ name: 'tools/c (actor-c)', value: 'tools/c' },
				],
			});
			expect(pushedActorIds()).toEqual([ACTOR_C.id]);
		});

		it('pushes nothing and exits 0 on an empty selection', async () => {
			multiSelect.mockResolvedValueOnce([]);

			await run({ flags_json: true });

			expect(commandProcess.exitCode).toBeFalsy();
			expect(getLoggedClientOrThrow).not.toHaveBeenCalled();
			expect(stdoutJson()).toEqual({ ok: true, operation: 'push', results: [], exitCode: 0 });
		});

		it('is skipped when a flag already chose', async () => {
			await run({ flags_all: true });

			expect(multiSelect).not.toHaveBeenCalled();
			expect(pushedActorIds()).toHaveLength(3);
		});
	});
});
