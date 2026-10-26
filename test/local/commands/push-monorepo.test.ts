import { execFileSync } from 'node:child_process';
import { existsSync, symlinkSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { ACTOR_SOURCE_TYPES, MAX_MULTIFILE_BYTES } from '@apify/consts';

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

interface VersionPayload {
	sourceType: string;
	sourceFiles?: { name: string }[];
	tarballUrl?: string;
	actorPath?: string;
}

const actorGet = vitest.fn(async (): Promise<typeof actor | null> => actor);
const actorDelete = vitest.fn(async () => {});
const actorsCreate = vitest.fn(async (_created: unknown) => actor);
const versionUpdate = vitest.fn(async (_modifier: unknown) => ({}));
const versionCreate = vitest.fn(async (created: unknown) => created);
const keyValueStoreGetOrCreate = vitest.fn(async () => ({ id: 'store1', urlSigningSecretKey: 'secret' }));
const setRecord = vitest.fn(async (_record: unknown) => {});

// What apify-client throws when a platform without the `actorPath` version field rejects the key.
const actorPathRejected = () =>
	Object.assign(new Error('Invalid actor version: actorPath is not allowed by the schema'), {
		statusCode: 400,
		type: 'invalid-request',
	});

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
			delete: actorDelete,
			version: () => ({ get: async () => currentVersion, update: versionUpdate }),
			versions: () => ({ create: versionCreate }),
			build: async () => build,
		}),
		actors: () => ({ create: actorsCreate }),
		keyValueStores: () => ({ getOrCreate: keyValueStoreGetOrCreate }),
		keyValueStore: () => ({ setRecord }),
		build: () => ({ get: async () => build }),
	})),
}));

// Creating an Actor looks its template up in the manifest; nothing here needs the network.
vitest.mock('@apify/actor-templates', () => ({ fetchManifest: async () => ({ templates: [] }) }));

// The mocked `node:process` copy has no signal handlers; nothing here needs them.
vitest.mock('../../../src/lib/hooks/useAbortJobOnSignal.js', () => ({
	useAbortJobOnSignal: () => ({ [Symbol.dispose]() {} }),
}));

// With `gitAvailable` off, every git call fails as it does without git, so the fixture counts as outside Git
// even though it lives inside this repository's checkout.
const gitState = vitest.hoisted(() => ({ gitAvailable: true }));
vitest.mock('node:child_process', async (importOriginal) => {
	const original = await importOriginal<typeof import('node:child_process')>();
	const unavailable = () => {
		throw new Error('not a git repository');
	};
	return {
		...original,
		execSync: ((...args: Parameters<typeof original.execSync>) =>
			gitState.gitAvailable ? original.execSync(...args) : unavailable()) as typeof original.execSync,
		execFileSync: ((...args: Parameters<typeof original.execFileSync>) =>
			gitState.gitAvailable ? original.execFileSync(...args) : unavailable()) as typeof original.execFileSync,
	};
});

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

function versionPayload(mock: typeof versionUpdate | typeof actorsCreate) {
	expect(mock).toHaveBeenCalledTimes(1);
	return mock.mock.calls[0][0] as VersionPayload;
}

function expectRefusal() {
	expect(commandProcess.exitCode).toBe(CommandExitCodes.NotImplemented);
	const stderr = logMessages.error.join('\n');
	expect(stderr).toContain('apify push does not support such Actors on the Apify platform yet');
	expect(stderr).toContain(MONOREPO_PLATFORM_SUPPORT_ISSUE_URL);
	expect(logMessages.log.join('\n')).not.toContain('Apify push result');
}

// The command sets its exit code on the mocked copy, but the framework records a thrown error on the real `process`.
let originalExitCode: typeof process.exitCode;
let originalRealExitCode: typeof process.exitCode;

beforeEach(async () => {
	originalExitCode = commandProcess.exitCode;
	originalRealExitCode = process.exitCode;
	gitState.gitAvailable = true;
	actorGet.mockClear();
	actorDelete.mockClear();
	actorsCreate.mockClear();
	versionUpdate.mockClear();
	versionCreate.mockClear();
	keyValueStoreGetOrCreate.mockClear();
	setRecord.mockClear();
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
	it('uploads the repository root as source files with the Actor folder as actorPath', async () => {
		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const modifier = versionPayload(versionUpdate);
		expect(modifier.sourceType).toBe(ACTOR_SOURCE_TYPES.SOURCE_FILES);
		expect(modifier.actorPath).toBe(ACTOR_PATH);
		expect(modifier.tarballUrl).toBeUndefined();
		const names = modifier.sourceFiles!.map((file) => file.name);
		expect(names).toEqual(
			expect.arrayContaining([
				`${ACTOR_PATH}/.actor/actor.json`,
				`${ACTOR_PATH}/src/index.ts`,
				'package.json',
				'shared/TypeScript_Dockerfile',
				'packages/typescript-utils/src/index.ts',
			]),
		);
		expect(names.some((name) => name.startsWith('node_modules'))).toBe(false);
		expect(names.some((name) => name.includes('\\'))).toBe(false);
		expect(keyValueStoreGetOrCreate).not.toHaveBeenCalled();
		expect(logMessages.error.join('\n')).not.toContain('uncommitted changes');
		expect(logMessages.log.join('\n')).toContain('Apify push result: SUCCEEDED');
	});

	it('keeps the --json envelope on stdout', async () => {
		await testRunCommand(ActorsPushCommand, { flags_json: true });

		expect(commandProcess.exitCode).toBeFalsy();
		expect(versionPayload(versionUpdate).actorPath).toBe(ACTOR_PATH);
		expect(logMessages.log).toHaveLength(1);
		expect(JSON.parse(logMessages.log[0])).toMatchObject({ ok: true, operation: 'push', actor: { id: ACTOR_ID } });
	});

	it('zips a repository over the multi-file limit into the OS temp directory and pushes it as a tarball', async () => {
		await write(`${ACTOR_PATH}/big.bin`, 'x'.repeat(MAX_MULTIFILE_BYTES + 1));

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		expect(keyValueStoreGetOrCreate).toHaveBeenCalledWith(`actor-${ACTOR_ID}-source`);
		expect(setRecord).toHaveBeenCalledTimes(1);
		const record = setRecord.mock.calls[0][0] as { key: string; value: Buffer; contentType: string };
		expect(record.key).toBe('version-0.0.zip');
		expect(record.contentType).toBe('application/zip');
		expect(Buffer.isBuffer(record.value)).toBe(true);
		expect(record.value.length).toBeGreaterThan(0);

		const modifier = versionPayload(versionUpdate);
		expect(modifier.sourceType).toBe(ACTOR_SOURCE_TYPES.TARBALL);
		expect(modifier.sourceFiles).toBeUndefined();
		expect(modifier.actorPath).toBe(ACTOR_PATH);
		const tarballUrl = new URL(modifier.tarballUrl!);
		expect(tarballUrl.pathname).toBe('/v2/key-value-stores/store1/records/version-0.0.zip');
		expect(tarballUrl.searchParams.get('disableRedirect')).toBe('true');
		expect(tarballUrl.searchParams.get('signature')).toBeTruthy();

		expect(existsSync(join(process.cwd(), 'temp_file.zip'))).toBe(false);
		expect(existsSync(joinPath('temp_file.zip'))).toBe(false);
	});

	it('uploads the files under a directory symlink as copies and leaves a dangling link out', async () => {
		symlinkSync('../../shared', joinPath(`${ACTOR_PATH}/shared`));
		symlinkSync('missing', joinPath('dangling'));
		git('add', '.');

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const names = versionPayload(versionUpdate).sourceFiles!.map((file) => file.name);
		expect(names).toContain(`${ACTOR_PATH}/shared/TypeScript_Dockerfile`);
		expect(names).toContain('shared/TypeScript_Dockerfile');
		expect(names).not.toContain(`${ACTOR_PATH}/shared`);
		expect(names).not.toContain('dangling');
	});

	it('warns about uncommitted changes, which the upload carries as they are', async () => {
		await write(`${ACTOR_PATH}/src/index.ts`, 'console.log(2);\n');

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		expect(versionUpdate).toHaveBeenCalledTimes(1);
		const warningLine = logMessages.error.find((line) => line.includes('uncommitted changes'));
		expect(warningLine).toBeDefined();
		expect(warningLine!.split('\n')).toHaveLength(1);
	});

	describe('on a platform without the actorPath field', () => {
		it('turns the 400 into the refusal with the tracking issue', async () => {
			versionUpdate.mockRejectedValueOnce(actorPathRejected());

			await testRunCommand(ActorsPushCommand, {});

			expectRefusal();
			expect(actorDelete).not.toHaveBeenCalled();
		});

		it('keeps stdout clean with --json', async () => {
			versionUpdate.mockRejectedValueOnce(actorPathRejected());

			await testRunCommand(ActorsPushCommand, { flags_json: true });

			expectRefusal();
			expect(logMessages.log).toEqual([]);
		});

		it('deletes the Actor it has just created', async () => {
			actorGet.mockResolvedValueOnce(null);
			versionUpdate.mockRejectedValueOnce(actorPathRejected());

			await testRunCommand(ActorsPushCommand, {});

			expectRefusal();
			expect(versionPayload(actorsCreate)).toMatchObject({ versions: [{ actorPath: ACTOR_PATH }] });
			expect(actorDelete).toHaveBeenCalledTimes(1);
		});

		it('still reports the refusal when deleting the just created Actor fails', async () => {
			actorGet.mockResolvedValueOnce(null);
			versionUpdate.mockRejectedValueOnce(actorPathRejected());
			actorDelete.mockRejectedValueOnce(new Error('delete failed'));

			await testRunCommand(ActorsPushCommand, {});

			expectRefusal();
			expect(actorDelete).toHaveBeenCalledTimes(1);
			expect(logMessages.error.join('\n')).toContain('delete failed');
		});

		it('refuses when the Actor create itself rejects actorPath, leaving nothing to delete', async () => {
			actorGet.mockResolvedValueOnce(null);
			actorsCreate.mockRejectedValueOnce(actorPathRejected());

			await testRunCommand(ActorsPushCommand, {});

			expectRefusal();
			expect(versionUpdate).not.toHaveBeenCalled();
			expect(actorDelete).not.toHaveBeenCalled();
		});

		it('passes other API errors through', async () => {
			versionUpdate.mockRejectedValueOnce(Object.assign(new Error('Version is locked'), { statusCode: 400 }));

			await testRunCommand(ActorsPushCommand, {});

			expect(commandProcess.exitCode).toBeFalsy();
			expect(process.exitCode).toBe(1);
			expect(logMessages.error.join('\n')).toContain('Version is locked');
			expect(logMessages.error.join('\n')).not.toContain(MONOREPO_PLATFORM_SUPPORT_ISSUE_URL);
		});
	});

	it('uploads the Docker context with .actorignore applied outside Git', async () => {
		await rm(joinPath('.git'), { recursive: true, force: true });
		await write('.actorignore', 'packages/\n');
		gitState.gitAvailable = false;

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const modifier = versionPayload(versionUpdate);
		expect(modifier.sourceType).toBe(ACTOR_SOURCE_TYPES.SOURCE_FILES);
		expect(modifier.actorPath).toBe(ACTOR_PATH);
		const names = modifier.sourceFiles!.map((file) => file.name);
		expect(names).toEqual(
			expect.arrayContaining([`${ACTOR_PATH}/.actor/actor.json`, 'package.json', 'shared/TypeScript_Dockerfile']),
		);
		expect(names.some((name) => name.startsWith('packages/'))).toBe(false);
		expect(names.some((name) => name.startsWith('node_modules'))).toBe(false);
	});

	it('rejects a dockerfile outside the Docker context before touching the platform', async () => {
		await writeActorConfig({ dockerContextDir: '../..', dockerfile: '../../../shared/TypeScript_Dockerfile' });

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		expect(logMessages.error.join('\n')).toContain('lies outside the Docker context');
		expect(actorGet).not.toHaveBeenCalled();
		expect(versionUpdate).not.toHaveBeenCalled();
		expect(keyValueStoreGetOrCreate).not.toHaveBeenCalled();
	});

	it('names the Actor folder in the refusal when actor.json has no name', async () => {
		await writeActorConfig({ name: undefined, dockerContextDir: '../../..' });
		versionUpdate.mockRejectedValueOnce(actorPathRejected());

		await testRunCommand(ActorsPushCommand, { args_actorId: ACTOR_ID });

		expectRefusal();
		expect(logMessages.error.join('\n')).toContain('Actor typescript-actor sets "dockerContextDir"');
	});

	it('checks the actor.json paths from the real Actor folder when --dir goes through a symlink', async () => {
		symlinkSync(ACTOR_PATH, joinPath('linked-actor'));
		forceNewCwd('linked-actor');

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const modifier = versionPayload(versionUpdate);
		expect(modifier.actorPath).toBe(ACTOR_PATH);
		expect(modifier.sourceFiles!.map((file) => file.name)).toContain(`${ACTOR_PATH}/.actor/actor.json`);
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

	it('pushes the Actor folder as usual when the Docker context lies inside it', async () => {
		await writeActorConfig({ dockerContextDir: '../src' });

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		expect(process.exitCode).toBeFalsy();
		const modifier = versionPayload(versionUpdate);
		expect(modifier.sourceType).toBe(ACTOR_SOURCE_TYPES.SOURCE_FILES);
		expect(modifier.sourceFiles!.map((file) => file.name).sort()).toEqual(['.actor/actor.json', 'src/index.ts']);
		expect(modifier).not.toHaveProperty('actorPath');
		expect(logMessages.log.join('\n')).toContain('Apify push result: SUCCEEDED');
	});
});
