import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { ACTOR_SOURCE_TYPES } from '@apify/consts';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { CommandExitCodes } from '../../../src/lib/consts.js';
import { MONOREPO_PLATFORM_SUPPORT_ISSUE_URL } from '../../../src/lib/docker-context.js';
import { cwdCache } from '../../../src/lib/hooks/useActorConfig.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const actName = 'push-monorepo-actor';
const ACTOR_ID = 'mOnO1234efGh';
const ACTOR_PATH = 'actors/typescript-actor';

const actor = {
	id: ACTOR_ID,
	name: actName,
	// Older than any local file, so the "modified on the platform" check never trips.
	modifiedAt: new Date(0),
	taggedBuilds: { latest: { buildId: 'build1' } },
};
const build = { id: 'build1', actId: ACTOR_ID, buildNumber: '0.0.1', status: 'SUCCEEDED' };
const currentVersion = { versionNumber: '0.0', sourceType: ACTOR_SOURCE_TYPES.SOURCE_FILES };

const actorGet = vitest.fn(async () => actor);
const versionUpdate = vitest.fn(async (_modifier: unknown) => ({}));
const versionCreate = vitest.fn(async (created: unknown) => created);
const keyValueStoreGetOrCreate = vitest.fn(async () => ({ id: 'store1' }));

// Stands in for the platform: the Actor and its version exist, and every write is recorded.
vitest.mock('../../../src/lib/utils.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/utils.js')>()),
	getCurrentUserInfo: vitest.fn(async () => ({ id: 'userId', username: 'user' })),
	outputJobLog: vitest.fn(async () => {}),
	getLoggedClientOrThrow: vitest.fn(async () => ({
		baseUrl: 'https://api.apify.com/v2',
		token: 'my-token',
		actor: () => ({
			get: actorGet,
			version: () => ({ get: async () => currentVersion, update: versionUpdate }),
			versions: () => ({ create: versionCreate }),
			build: async () => build,
		}),
		keyValueStores: () => ({ getOrCreate: keyValueStoreGetOrCreate }),
		build: () => ({ get: async () => build }),
	})),
}));

// The mocked `node:process` copy has no signal handlers; nothing here needs them.
vitest.mock('../../../src/lib/hooks/useAbortJobOnSignal.js', () => ({
	useAbortJobOnSignal: () => ({ [Symbol.dispose]() {} }),
}));

const { beforeAllCalls, afterAllCalls, joinPath, tmpPath, forceNewCwd } = useTempPath(actName, {
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

async function writeActorConfig(fields: Record<string, unknown>) {
	await write(
		`${ACTOR_PATH}/.actor/actor.json`,
		JSON.stringify({ actorSpecification: 1, name: actName, version: '0.0', buildTag: 'latest', ...fields }),
	);
}

function git(...args: string[]) {
	execFileSync('git', args, { cwd: tmpPath, stdio: 'ignore' });
}

// The command sets its exit code on the mocked copy, but the framework records a thrown error on the real `process`.
let originalExitCode: typeof process.exitCode;
let originalRealExitCode: typeof process.exitCode;

beforeEach(async () => {
	originalExitCode = commandProcess.exitCode;
	originalRealExitCode = process.exitCode;
	actorGet.mockClear();
	versionUpdate.mockClear();
	versionCreate.mockClear();
	keyValueStoreGetOrCreate.mockClear();
	cwdCache.clear();
	await beforeAllCalls();

	// The layout of apify/actor-monorepo-example, as its own Git repository.
	await write('package.json', '{"workspaces":["actors/**","packages/**"]}');
	await write('.gitignore', 'node_modules\n');
	await write('shared/TypeScript_Dockerfile', 'FROM apify/actor-node:20\n');
	await write('packages/typescript-utils/src/index.ts', 'export const x = 1;\n');
	await writeActorConfig({ dockerContextDir: '../../..', dockerfile: '../../../shared/TypeScript_Dockerfile' });
	await write(`${ACTOR_PATH}/src/index.ts`, 'console.log(1);\n');
	git('init', '--quiet');
	git('add', '.');
	git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'init');

	forceNewCwd(ACTOR_PATH);
});

afterEach(async () => {
	commandProcess.exitCode = originalExitCode;
	process.exitCode = originalRealExitCode;
	await afterAllCalls();
});

describe('apify push of a monorepo Actor', () => {
	it('stops before touching the platform, pointing at the tracking issue', async () => {
		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.NotImplemented);
		const stderr = logMessages.error.join('\n');
		expect(stderr).toContain(
			`Actor ${actName} sets "dockerContextDir" in .actor/actor.json, so it builds from a Docker context outside its own folder (a monorepo Actor).`,
		);
		expect(stderr).toContain('apify push does not support such Actors on the Apify platform yet');
		expect(stderr).toContain(MONOREPO_PLATFORM_SUPPORT_ISSUE_URL);
		expect(stderr).toContain("set the Actor's source in Apify Console to the Git repository with the folder");
		expect(actorGet).not.toHaveBeenCalled();
		expect(versionCreate).not.toHaveBeenCalled();
		expect(versionUpdate).not.toHaveBeenCalled();
		expect(keyValueStoreGetOrCreate).not.toHaveBeenCalled();
	});

	it('keeps stdout clean with --json', async () => {
		await testRunCommand(ActorsPushCommand, { flags_json: true });

		expect(commandProcess.exitCode).toBe(CommandExitCodes.NotImplemented);
		expect(logMessages.log).toEqual([]);
		expect(logMessages.error.join('\n')).toContain(MONOREPO_PLATFORM_SUPPORT_ISSUE_URL);
		expect(versionUpdate).not.toHaveBeenCalled();
	});

	it('names the Actor folder when actor.json has no name', async () => {
		await writeActorConfig({ name: undefined, dockerContextDir: '../../..' });

		await testRunCommand(ActorsPushCommand, { args_actorId: ACTOR_ID });

		expect(commandProcess.exitCode).toBe(CommandExitCodes.NotImplemented);
		expect(logMessages.error.join('\n')).toContain('Actor typescript-actor sets "dockerContextDir"');
		expect(actorGet).not.toHaveBeenCalled();
	});

	it.each([
		['outside the Git repository, which the platform could not build', '../../../..', 'outside the Git repository'],
		['that does not exist', '../../../missing', 'which does not exist'],
		['that is not a string', 42, 'must be a string'],
	])('rejects a dockerContextDir %s as an invalid actor.json', async (_, dockerContextDir, message) => {
		await writeActorConfig({ dockerContextDir });

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		expect(logMessages.error.join('\n')).toContain(message);
		expect(actorGet).not.toHaveBeenCalled();
		expect(versionUpdate).not.toHaveBeenCalled();
	});

	it.each([
		['lies inside it', { dockerContextDir: '../src' }],
		['is not set', {}],
	])('pushes the Actor folder as usual when the Docker context %s', async (_, fields) => {
		await writeActorConfig(fields);

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		expect(process.exitCode).toBeFalsy();
		expect(versionUpdate).toHaveBeenCalledTimes(1);
		const modifier = versionUpdate.mock.calls[0][0] as { sourceType: string; sourceFiles: { name: string }[] };
		expect(modifier.sourceType).toBe(ACTOR_SOURCE_TYPES.SOURCE_FILES);
		expect(modifier.sourceFiles.map((file) => file.name).sort()).toEqual(['.actor/actor.json', 'src/index.ts']);
		expect(logMessages.log.join('\n')).toContain('Apify push result: SUCCEEDED');
	});
});
