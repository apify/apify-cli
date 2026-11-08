import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, renameSync, symlinkSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import AdmZip from 'adm-zip';

import { ACTOR_SOURCE_TYPES, MAX_MULTIFILE_BYTES } from '@apify/consts';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { CommandExitCodes } from '../../../src/lib/consts.js';
import { MONOREPO_PLATFORM_SUPPORT_ISSUE_URL } from '../../../src/lib/docker-context.js';
import { cwdCache } from '../../../src/lib/hooks/useActorConfig.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useIsolatedGit } from '../../__setup__/hooks/useIsolatedGit.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const actName = 'push-monorepo-actor';
const ACTOR_ID = 'mOnO1234efGh';
const ACTOR_PATH = 'actors/typescript-actor';
// As on macOS and Windows by default: this file is found under its name in upper case too.
const caseInsensitiveFileSystem = existsSync(fileURLToPath(import.meta.url).toUpperCase());

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
	sourceFiles?: { name: string; content?: string }[];
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

// A sibling folder of the repository: the target of links that leave it.
const outside = useTempPath('push-monorepo-outside', { create: true, remove: true, cwd: false, cwdParent: false });

// Git reads the global excludes file, so the developer's own one could leave out the files these tests push.
useIsolatedGit('push-monorepo-git-home');

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
	actorGet.mockReset();
	actorDelete.mockReset();
	actorsCreate.mockReset();
	versionUpdate.mockReset();
	versionCreate.mockReset();
	keyValueStoreGetOrCreate.mockClear();
	setRecord.mockClear();
	cwdCache.clear();
	await beforeAllCalls();
	await outside.beforeAllCalls();

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
	await outside.afterAllCalls();
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
		expect(record.key).toMatch(/^version-0\.0-monorepo-[0-9a-f]{16}\.zip$/);
		expect(record.contentType).toBe('application/zip');
		expect(Buffer.isBuffer(record.value)).toBe(true);
		expect(record.value.length).toBeGreaterThan(0);

		const modifier = versionPayload(versionUpdate);
		expect(modifier.sourceType).toBe(ACTOR_SOURCE_TYPES.TARBALL);
		expect(modifier.sourceFiles).toBeUndefined();
		expect(modifier.actorPath).toBe(ACTOR_PATH);
		const tarballUrl = new URL(modifier.tarballUrl!);
		expect(tarballUrl.pathname).toBe(`/v2/key-value-stores/store1/records/${record.key}`);
		expect(tarballUrl.searchParams.get('disableRedirect')).toBe('true');
		expect(tarballUrl.searchParams.get('signature')).toBeTruthy();

		expect(existsSync(join(process.cwd(), 'temp_file.zip'))).toBe(false);
		expect(existsSync(joinPath('temp_file.zip'))).toBe(false);
	});

	it('zips the upload with the repository root at the top level, where the platform resolves actorPath', async () => {
		await write(`${ACTOR_PATH}/big.bin`, 'x'.repeat(MAX_MULTIFILE_BYTES + 1));

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const record = setRecord.mock.calls[0][0] as { value: Buffer };
		const names = new AdmZip(record.value).getEntries().map((entry) => entry.entryName);
		expect(names).toEqual(
			expect.arrayContaining(['package.json', `${versionPayload(versionUpdate).actorPath}/.actor/actor.json`]),
		);
	});

	it('gives each actorPath its own zip record, so a failed update leaves the record of the version as it was', async () => {
		await write(`${ACTOR_PATH}/big.bin`, 'x'.repeat(MAX_MULTIFILE_BYTES + 1));
		await testRunCommand(ActorsPushCommand, {});
		expect(commandProcess.exitCode).toBeFalsy();

		// The version now builds from that record with the old actorPath; a push after a rename then fails its update.
		renameSync(joinPath(ACTOR_PATH), joinPath('actors/renamed-actor'));
		forceNewCwd('actors/renamed-actor');
		cwdCache.clear();
		versionUpdate.mockRejectedValueOnce(new Error('network down'));
		await testRunCommand(ActorsPushCommand, { flags_force: true });

		expect(logMessages.error.join('\n')).toContain('network down');
		const keys = setRecord.mock.calls.map(([record]) => (record as { key: string }).key);
		expect(keys).toHaveLength(2);
		expect(keys[1]).not.toBe(keys[0]);
	});

	it('zips a repository under the multi-file limit when a file name exceeds what the platform accepts', async () => {
		const longPath = `packages/${'a'.repeat(120)}/${'b'.repeat(120)}/fixture.json`;
		await write(longPath, '{}');
		git('add', '.');

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const modifier = versionPayload(versionUpdate);
		expect(modifier.sourceType).toBe(ACTOR_SOURCE_TYPES.TARBALL);
		expect(modifier.sourceFiles).toBeUndefined();
		const record = setRecord.mock.calls[0][0] as { value: Buffer };
		expect(new AdmZip(record.value).getEntry(longPath)).toBeTruthy();
	});

	it('zips a repository under the multi-file limit whose content grows over it as sent, as base64 does to binary files', async () => {
		// Raw bytes under the limit, but a binary file goes as base64, which the platform counts at four thirds.
		await write(`${ACTOR_PATH}/image.bin`, '\u0000'.repeat(Math.floor(MAX_MULTIFILE_BYTES * 0.9)));

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const modifier = versionPayload(versionUpdate);
		expect(modifier.sourceType).toBe(ACTOR_SOURCE_TYPES.TARBALL);
		expect(modifier.sourceFiles).toBeUndefined();
		expect(setRecord).toHaveBeenCalledTimes(1);
	});

	it('zips a repository whose text holds emoji the platform counts over the multi-file limit', async () => {
		// Four bytes each in UTF-8, so the raw size stays under the limit, but the platform counts five.
		await write(`${ACTOR_PATH}/emoji.txt`, '\u{1F600}'.repeat(700_000));

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		expect(versionPayload(versionUpdate).sourceType).toBe(ACTOR_SOURCE_TYPES.TARBALL);
	});

	it('leaves no zip in the OS temp directory when getting the source store fails', async () => {
		await write(`${ACTOR_PATH}/big.bin`, 'x'.repeat(MAX_MULTIFILE_BYTES + 1));
		const pushZips = () => readdirSync(tmpdir()).filter((name) => /^apify-push-.*\.zip$/.test(name));
		const zipsBefore = pushZips();
		keyValueStoreGetOrCreate.mockRejectedValueOnce(new Error('network down'));

		await testRunCommand(ActorsPushCommand, {});

		expect(process.exitCode).toBe(1);
		expect(logMessages.error.join('\n')).toContain('network down');
		expect(pushZips().filter((name) => !zipsBefore.includes(name))).toEqual([]);
	});

	it('zips a file reached through a symlink as its content, as the multi-file upload sends it', async () => {
		await write(`${ACTOR_PATH}/big.bin`, 'x'.repeat(MAX_MULTIFILE_BYTES + 1));
		await write('shared/input_schema.json', '{"title":"Input","type":"object","properties":{}}');
		symlinkSync('../../../shared/input_schema.json', joinPath(`${ACTOR_PATH}/.actor/input_schema.json`));
		git('add', '.');

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const record = setRecord.mock.calls[0][0] as { value: Buffer };
		const entry = new AdmZip(record.value).getEntry(`${ACTOR_PATH}/.actor/input_schema.json`);
		// A link entry would hold the link's target path, which the platform unzips as a link to a file it lacks.
		expect(entry?.getData().toString()).toContain('"title":"Input"');
	});

	it('uploads the files under a directory symlink as copies and leaves dangling and outside links out', async () => {
		symlinkSync('../../shared', joinPath(`${ACTOR_PATH}/shared`));
		symlinkSync('missing', joinPath('dangling'));
		await writeFile(outside.joinPath('outside.txt'), 'outside\n');
		symlinkSync(outside.joinPath('outside.txt'), joinPath('outside.txt'));
		git('add', '.');

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const names = versionPayload(versionUpdate).sourceFiles!.map((file) => file.name);
		expect(names).toContain(`${ACTOR_PATH}/shared/TypeScript_Dockerfile`);
		expect(names).toContain('shared/TypeScript_Dockerfile');
		expect(names).not.toContain(`${ACTOR_PATH}/shared`);
		expect(names).not.toContain('dangling');
		expect(names).not.toContain('outside.txt');
	});

	it('sends a link to a file the upload holds as that file and leaves out one to a file the upload lacks', async () => {
		// A workspace package shares the root .env, which only the root .gitignore line covers.
		await write('.gitignore', 'node_modules\n/.env\n');
		await write('.env', 'API_TOKEN=secret\n');
		symlinkSync('../../.env', joinPath('packages/typescript-utils/.env'));
		symlinkSync('../.git/config', joinPath('shared/git-config'));
		symlinkSync('../package.json', joinPath('shared/package.json'));
		git('add', '.');

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const files = versionPayload(versionUpdate).sourceFiles!;
		const names = files.map((file) => file.name);
		expect(names).not.toContain('packages/typescript-utils/.env');
		expect(names).not.toContain('shared/git-config');
		expect(files.find((file) => file.name === 'shared/package.json')?.content).toContain('workspaces');
	});

	it('sends a link elsewhere in the repository to a file only the Actor folder adds', async () => {
		// The Actor folder's .actorignore takes back its gitignored dist, which a clone lacks.
		await write('.gitignore', 'node_modules\ndist\n');
		await write(`${ACTOR_PATH}/.actorignore`, '!dist/\n');
		await write(`${ACTOR_PATH}/dist/main.js`, 'console.log(1);\n');
		symlinkSync(`../${ACTOR_PATH}/dist/main.js`, joinPath('shared/main.js'));
		git('add', '.');

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const files = versionPayload(versionUpdate).sourceFiles!;
		expect(files.find((file) => file.name === 'shared/main.js')?.content).toContain('console.log(1)');
	});

	it('sends a directory link elsewhere in the repository to files only the Actor folder adds as copies', async () => {
		await write('.gitignore', 'node_modules\ndist\n');
		await write(`${ACTOR_PATH}/.actorignore`, '!dist/\n');
		await write(`${ACTOR_PATH}/dist/main.js`, 'console.log(1);\n');
		symlinkSync(`../${ACTOR_PATH}/dist`, joinPath('shared/actor-dist'));
		git('add', '.');

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const files = versionPayload(versionUpdate).sourceFiles!;
		expect(files.find((file) => file.name === 'shared/actor-dist/main.js')?.content).toContain('console.log(1)');
	});

	it('copies the files under a directory link inside a linked directory, as a clone resolves both, and ends a cycle', async () => {
		await write('config/app.json', '{"app":true}');
		symlinkSync('packages/typescript-utils', joinPath('linked-utils'));
		symlinkSync('../../config', joinPath('packages/typescript-utils/config'));
		symlinkSync('.', joinPath('packages/typescript-utils/self'));
		git('add', '.');

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const files = versionPayload(versionUpdate).sourceFiles!;
		const names = files.map((file) => file.name);
		expect(names).toEqual(
			expect.arrayContaining([
				'linked-utils/src/index.ts',
				'packages/typescript-utils/config/app.json',
				'packages/typescript-utils/self/src/index.ts',
			]),
		);
		expect(files.find((file) => file.name === 'linked-utils/config/app.json')?.content).toBe('{"app":true}');
		expect(names.some((name) => name.includes('/self/self/'))).toBe(false);
	});

	it('accepts a schema reached through a symlink inside the repository and uploads it at the link path', async () => {
		await write('shared/input_schema.json', '{"title":"Input","type":"object","properties":{}}');
		symlinkSync('../../../shared/input_schema.json', joinPath(`${ACTOR_PATH}/.actor/input_schema.json`));
		await writeActorConfig({
			dockerContextDir: '../../..',
			dockerfile: '../../../shared/TypeScript_Dockerfile',
			input: './input_schema.json',
		});
		git('add', '.');

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const files = versionPayload(versionUpdate).sourceFiles!;
		const linked = files.find((file) => file.name === `${ACTOR_PATH}/.actor/input_schema.json`);
		expect(linked?.content).toContain('"title":"Input"');
	});

	it('accepts a Dockerfile in a Docker context reached through a symlink inside the repository', async () => {
		// `context-link` links to the shared folder; the upload carries it as a normal folder under the link's name.
		symlinkSync('shared', joinPath('context-link'));
		await writeActorConfig({
			dockerContextDir: '../../../context-link',
			dockerfile: '../../../context-link/TypeScript_Dockerfile',
		});
		git('add', '.');

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const names = versionPayload(versionUpdate).sourceFiles!.map((file) => file.name);
		expect(names).toContain('context-link/TypeScript_Dockerfile');
	});

	it('rejects a schema reached through a symlink leaving the repository, which the upload leaves out', async () => {
		await writeFile(outside.joinPath('input_schema.json'), '{}');
		symlinkSync(outside.joinPath('input_schema.json'), joinPath(`${ACTOR_PATH}/.actor/input_schema.json`));
		await writeActorConfig({
			dockerContextDir: '../../..',
			dockerfile: '../../../shared/TypeScript_Dockerfile',
			input: './input_schema.json',
		});
		git('add', '.');

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		const stderr = logMessages.error.join('\n');
		expect(stderr).toContain('"input": "./input_schema.json"');
		expect(stderr).toContain('is not among the files apify push uploads');
		expect(actorGet).not.toHaveBeenCalled();
		expect(versionUpdate).not.toHaveBeenCalled();
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

		it('leaves the zip record of the existing version alone', async () => {
			await write(`${ACTOR_PATH}/big.bin`, 'x'.repeat(MAX_MULTIFILE_BYTES + 1));
			versionUpdate.mockRejectedValueOnce(actorPathRejected());

			await testRunCommand(ActorsPushCommand, {});

			expectRefusal();
			expect(setRecord.mock.calls.map(([record]) => (record as { key: string }).key)).not.toContain('version-0.0.zip');
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

		it("passes the field's own validation errors through", async () => {
			versionUpdate.mockRejectedValueOnce(
				Object.assign(new Error('Invalid value provided in version: actorPath must be at most 255 characters long'), {
					statusCode: 400,
				}),
			);

			await testRunCommand(ActorsPushCommand, {});

			expect(process.exitCode).toBe(1);
			expect(logMessages.error.join('\n')).toContain('actorPath must be at most 255 characters long');
			expect(logMessages.error.join('\n')).not.toContain(MONOREPO_PLATFORM_SUPPORT_ISSUE_URL);
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
		// The fixture's .git stays, though git itself is unavailable: it ends the walk for .gitignore files above the
		// fixture, so the .gitignore of this checkout never applies.
		await write('.actorignore', 'packages/\n');
		// Local run state of the Actor, which an ordinary push of its folder leaves out too.
		await write(`${ACTOR_PATH}/node_modules/dep/index.js`, 'module.exports = 1;\n');
		await write(`${ACTOR_PATH}/storage/key_value_stores/default/INPUT.json`, '{}');
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
		expect(
			names.filter((name) => ['node_modules', 'storage'].some((dir) => name.startsWith(`${ACTOR_PATH}/${dir}/`))),
		).toEqual([]);
	});

	it('leaves out the files under a folder symlink leading out of the Docker context outside Git', async () => {
		await mkdir(outside.joinPath('folder'), { recursive: true });
		await writeFile(outside.joinPath('folder/outside.txt'), 'outside\n');
		symlinkSync(outside.joinPath('folder'), joinPath('external'));
		symlinkSync('shared', joinPath('internal'));
		gitState.gitAvailable = false;

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const names = versionPayload(versionUpdate).sourceFiles!.map((file) => file.name);
		expect(names).toContain('internal/TypeScript_Dockerfile');
		expect(names.filter((name) => name.startsWith('external/'))).toEqual([]);
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

	describe('with the Docker context at the repository root and no dockerfile field', () => {
		beforeEach(async () => {
			await writeActorConfig({ dockerContextDir: '../../..' });
		});

		it('pushes with the default Dockerfile in the Actor folder, which lies inside the context', async () => {
			await write(`${ACTOR_PATH}/Dockerfile`, 'FROM apify/actor-node:20\n');
			git('add', '.');

			await testRunCommand(ActorsPushCommand, {});

			expect(commandProcess.exitCode).toBeFalsy();
			const modifier = versionPayload(versionUpdate);
			expect(modifier.actorPath).toBe(ACTOR_PATH);
			expect(modifier.sourceFiles!.map((file) => file.name)).toContain(`${ACTOR_PATH}/Dockerfile`);
			expect(logMessages.log.join('\n')).toContain('Apify push result: SUCCEEDED');
		});

		it('exits as an invalid actor.json without a Dockerfile at the default locations', async () => {
			git('add', '.');

			await testRunCommand(ActorsPushCommand, {});

			expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
			expect(logMessages.error.join('\n')).toContain('"dockerfile" is not set');
			expect(actorGet).not.toHaveBeenCalled();
			expect(versionUpdate).not.toHaveBeenCalled();
		});
	});

	it('names the Actor folder in the refusal when actor.json has no name', async () => {
		await writeActorConfig({
			name: undefined,
			dockerContextDir: '../../..',
			dockerfile: '../../../shared/TypeScript_Dockerfile',
		});
		versionUpdate.mockRejectedValueOnce(actorPathRejected());

		await testRunCommand(ActorsPushCommand, { args_actorId: ACTOR_ID });

		expectRefusal();
		expect(logMessages.error.join('\n')).toContain('Actor typescript-actor sets "dockerContextDir"');
	});

	it('adds the files of an Actor folder ignored by .gitignore when --dir names it, as a clone has none of them', async () => {
		await write('.gitignore', 'node_modules\nactors/\n');
		git('rm', '-r', '--cached', '--quiet', 'actors');
		forceNewCwd('.');

		await testRunCommand(ActorsPushCommand, { flags_dir: ACTOR_PATH });

		expect(commandProcess.exitCode).toBeFalsy();
		const modifier = versionPayload(versionUpdate);
		expect(modifier.actorPath).toBe(ACTOR_PATH);
		expect(modifier.sourceFiles!.map((file) => file.name)).toEqual(
			expect.arrayContaining([
				`${ACTOR_PATH}/.actor/actor.json`,
				`${ACTOR_PATH}/src/index.ts`,
				'shared/TypeScript_Dockerfile',
			]),
		);
	});

	it("applies the Actor folder's .actorignore, negations included, and leaves the rest of the repository as a clone has it", async () => {
		await write('.gitignore', 'node_modules\ndist\n');
		await write(`${ACTOR_PATH}/.actorignore`, 'local-secrets.json\n!dist/\n');
		await write(`${ACTOR_PATH}/local-secrets.json`, '{}');
		await write(`${ACTOR_PATH}/dist/main.js`, 'console.log(1);\n');
		await write('packages/typescript-utils/dist/index.js', 'export const x = 1;\n');

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const names = versionPayload(versionUpdate).sourceFiles!.map((file) => file.name);
		expect(names).toEqual(
			expect.arrayContaining([`${ACTOR_PATH}/dist/main.js`, 'packages/typescript-utils/src/index.ts']),
		);
		expect(names).not.toContain(`${ACTOR_PATH}/local-secrets.json`);
		expect(names).not.toContain('packages/typescript-utils/dist/index.js');
	});

	it('pushes an Actor folder whose name is stored decomposed with one copy of its files under actorPath', async () => {
		// Finder stores names decomposed (NFD), and git on macOS lists them composed (NFC).
		const decomposedPath = 'actors/café-actor';
		await write(
			`${decomposedPath}/.actor/actor.json`,
			JSON.stringify({
				actorSpecification: 1,
				name: actName,
				version: '0.0',
				buildTag: 'latest',
				dockerContextDir: '../../..',
				dockerfile: '../../../shared/TypeScript_Dockerfile',
			}),
		);
		git('add', '.');
		forceNewCwd(decomposedPath);

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const { actorPath, sourceFiles } = versionPayload(versionUpdate);
		const names = sourceFiles!.map((file) => file.name);
		expect(names).toContain(`${actorPath}/.actor/actor.json`);
		expect(names.filter((name) => name.normalize('NFC') === 'actors/café-actor/.actor/actor.json')).toHaveLength(1);
	});

	it.runIf(caseInsensitiveFileSystem)(
		'pushes an Actor folder renamed by case only, which Git still lists in its old case, with one copy of its files',
		async () => {
			await write(`${ACTOR_PATH}/.actorignore`, 'fixtures/\n');
			await write(`${ACTOR_PATH}/fixtures/big.json`, '{}');
			git('add', '.');
			git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'fixtures');
			// Without git mv, Git on a case-insensitive file system keeps the old case in its index.
			renameSync(joinPath(ACTOR_PATH), joinPath('actors/renaming'));
			renameSync(joinPath('actors/renaming'), joinPath('actors/TypeScript-Actor'));
			forceNewCwd('actors/TypeScript-Actor');

			await testRunCommand(ActorsPushCommand, {});

			expect(commandProcess.exitCode).toBeFalsy();
			const { actorPath, sourceFiles } = versionPayload(versionUpdate);
			const names = sourceFiles!.map((file) => file.name);
			expect(actorPath).toBe('actors/TypeScript-Actor');
			expect(names.filter((name) => name.toLowerCase().startsWith('actors/typescript-actor/fixtures/'))).toEqual([]);
			expect(names.filter((name) => name.toLowerCase() === 'actors/typescript-actor/.actor/actor.json')).toHaveLength(
				1,
			);
		},
	);

	it.runIf(caseInsensitiveFileSystem)(
		'sends the siblings of the Actor folder under the folder name actorPath spells after a case-only rename',
		async () => {
			await write('actors/lib/util.js', 'export const y = 2;\n');
			git('add', '.');
			git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'lib');
			renameSync(joinPath('actors'), joinPath('renaming'));
			renameSync(joinPath('renaming'), joinPath('Actors'));
			forceNewCwd('Actors/typescript-actor');

			await testRunCommand(ActorsPushCommand, {});

			expect(commandProcess.exitCode).toBeFalsy();
			const { actorPath, sourceFiles } = versionPayload(versionUpdate);
			const names = sourceFiles!.map((file) => file.name);
			expect(actorPath).toBe('Actors/typescript-actor');
			expect(names).toEqual(expect.arrayContaining(['Actors/lib/util.js', 'Actors/typescript-actor/src/index.ts']));
			expect(names.filter((name) => name.startsWith('actors/'))).toEqual([]);
		},
	);

	it.runIf(caseInsensitiveFileSystem)(
		'copies through directory links after a case-only rename of the Actor folder, its gitignored dist included, under one spelling',
		async () => {
			await write('.gitignore', 'node_modules\ndist\n');
			await write(`${ACTOR_PATH}/.actorignore`, '!dist/\n');
			await write(`${ACTOR_PATH}/dist/main.js`, 'console.log(1);\n');
			symlinkSync(`../${ACTOR_PATH}/dist`, joinPath('shared/actor-dist'));
			symlinkSync('actors', joinPath('linked-actors'));
			git('add', '.');
			git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'links');
			renameSync(joinPath(ACTOR_PATH), joinPath('actors/renaming'));
			renameSync(joinPath('actors/renaming'), joinPath('actors/TypeScript-Actor'));
			forceNewCwd('actors/TypeScript-Actor');

			await testRunCommand(ActorsPushCommand, {});

			expect(commandProcess.exitCode).toBeFalsy();
			const names = versionPayload(versionUpdate).sourceFiles!.map((file) => file.name);
			expect(names).toEqual(
				expect.arrayContaining(['shared/actor-dist/main.js', 'linked-actors/typescript-actor/src/index.ts']),
			);
			expect(names.filter((name) => name.startsWith('linked-actors/TypeScript-Actor/'))).toEqual([]);
		},
	);

	it.runIf(!caseInsensitiveFileSystem)(
		'keeps a link named like a folder of the Actor folder in another case as a folder of its own',
		async () => {
			await write('actors/lib/util.js', 'export const y = 2;\n');
			symlinkSync('actors', joinPath('Actors'));
			git('add', '.');

			await testRunCommand(ActorsPushCommand, {});

			expect(commandProcess.exitCode).toBeFalsy();
			const names = versionPayload(versionUpdate).sourceFiles!.map((file) => file.name);
			expect(names).toEqual(expect.arrayContaining(['actors/lib/util.js', 'Actors/lib/util.js']));
		},
	);

	it.runIf(!caseInsensitiveFileSystem)(
		'copies a gitignored Actor file through a directory link when a tracked file differs from it in case only',
		async () => {
			await write('.gitignore', 'node_modules\ndist\n');
			await write(`${ACTOR_PATH}/.actorignore`, '!dist/\n');
			await write(`${ACTOR_PATH}/dist/main.js`, 'console.log(1);\n');
			await write(`${ACTOR_PATH}/Dist/main.js`, 'console.log(2);\n');
			symlinkSync(`../${ACTOR_PATH}/dist`, joinPath('shared/actor-dist'));
			git('add', '.');
			git('add', '--force', `${ACTOR_PATH}/Dist/main.js`);

			await testRunCommand(ActorsPushCommand, {});

			expect(commandProcess.exitCode).toBeFalsy();
			const files = versionPayload(versionUpdate).sourceFiles!;
			expect(files.find((file) => file.name === 'shared/actor-dist/main.js')?.content).toContain('console.log(1)');
		},
	);

	// As on macOS: git lists the folder composed (NFC) while it is stored decomposed (NFD).
	it.runIf(process.platform === 'darwin')(
		'sends the siblings of an Actor folder in a folder stored decomposed under the name actorPath spells',
		async () => {
			const decomposedParent = 'packages/cafe\u0301';
			await write(
				`${decomposedParent}/actor/.actor/actor.json`,
				JSON.stringify({
					actorSpecification: 1,
					name: actName,
					version: '0.0',
					dockerContextDir: '../../../..',
					dockerfile: '../../../../shared/TypeScript_Dockerfile',
				}),
			);
			await write(`${decomposedParent}/lib/util.py`, 'x = 1\n');
			git('add', '.');
			forceNewCwd(`${decomposedParent}/actor`);

			await testRunCommand(ActorsPushCommand, {});

			expect(commandProcess.exitCode).toBeFalsy();
			const { actorPath, sourceFiles } = versionPayload(versionUpdate);
			const names = sourceFiles!.map((file) => file.name);
			expect(actorPath).toBe(`${decomposedParent}/actor`);
			expect(names).toEqual(
				expect.arrayContaining([`${decomposedParent}/lib/util.py`, `${decomposedParent}/actor/.actor/actor.json`]),
			);
			expect(names.filter((name) => name.startsWith('packages/caf\u00e9/'))).toEqual([]);
		},
	);

	// As on macOS: a name composed (NFC) finds the folder stored decomposed (NFD).
	it.runIf(process.platform === 'darwin')(
		'uploads links elsewhere that compose the name of an Actor folder stored decomposed',
		async () => {
			const decomposedPath = 'actors/cafe\u0301-actor';
			const composedPath = 'actors/caf\u00e9-actor';
			await write(
				`${decomposedPath}/.actor/actor.json`,
				JSON.stringify({
					actorSpecification: 1,
					name: actName,
					version: '0.0',
					dockerContextDir: '../../..',
					dockerfile: '../../../shared/TypeScript_Dockerfile',
				}),
			);
			await write(`${decomposedPath}/src/main.js`, 'console.log(1);\n');
			symlinkSync(`../${composedPath}/src/main.js`, joinPath('shared/main.js'));
			symlinkSync(`../${composedPath}/src`, joinPath('shared/actor-src'));
			git('add', '.');
			forceNewCwd(decomposedPath);

			await testRunCommand(ActorsPushCommand, {});

			expect(commandProcess.exitCode).toBeFalsy();
			const names = versionPayload(versionUpdate).sourceFiles!.map((file) => file.name);
			expect(names).toEqual(expect.arrayContaining(['shared/main.js', 'shared/actor-src/main.js']));
		},
	);

	it.runIf(caseInsensitiveFileSystem)(
		'uploads links elsewhere that spell an Actor folder renamed by case only in its old case',
		async () => {
			symlinkSync(`../${ACTOR_PATH}/src/index.ts`, joinPath('shared/index.ts'));
			symlinkSync(`../${ACTOR_PATH}/src`, joinPath('shared/actor-src'));
			git('add', '.');
			git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'links');
			renameSync(joinPath(ACTOR_PATH), joinPath('actors/renaming'));
			renameSync(joinPath('actors/renaming'), joinPath('actors/TypeScript-Actor'));
			forceNewCwd('actors/TypeScript-Actor');

			await testRunCommand(ActorsPushCommand, {});

			expect(commandProcess.exitCode).toBeFalsy();
			const names = versionPayload(versionUpdate).sourceFiles!.map((file) => file.name);
			expect(names).toEqual(expect.arrayContaining(['shared/index.ts', 'shared/actor-src/index.ts']));
		},
	);

	it.runIf(caseInsensitiveFileSystem)(
		'uploads a link in the Actor folder whose target names the repository in another letter case',
		async () => {
			const repositoryInUpperCase = basename(tmpPath).toUpperCase();
			symlinkSync(
				`../../../${repositoryInUpperCase}/packages/typescript-utils/src/index.ts`,
				joinPath(`${ACTOR_PATH}/case-link.ts`),
			);

			await testRunCommand(ActorsPushCommand, {});

			expect(commandProcess.exitCode).toBeFalsy();
			const names = versionPayload(versionUpdate).sourceFiles!.map((file) => file.name);
			expect(names).toContain(`${ACTOR_PATH}/case-link.ts`);
		},
	);

	describe.runIf(caseInsensitiveFileSystem)('with --dir typed in another case', () => {
		it.each([
			[
				'a monorepo Actor with actorPath in the case on disk',
				{ dockerContextDir: '../../..', dockerfile: '../../../shared/TypeScript_Dockerfile' },
				ACTOR_PATH,
			],
			[
				'an Actor with the Docker context inside its folder',
				{ dockerContextDir: '../src', dockerfile: '../src/Dockerfile' },
				undefined,
			],
		])('pushes %s', async (_, fields, expectedActorPath) => {
			await write(`${ACTOR_PATH}/src/Dockerfile`, 'FROM apify/actor-node:20\n');
			await writeActorConfig(fields);
			forceNewCwd('.');

			await testRunCommand(ActorsPushCommand, { flags_dir: 'actors/TypeScript-Actor' });

			expect(commandProcess.exitCode).toBeFalsy();
			const modifier = versionPayload(versionUpdate);
			expect(modifier.actorPath).toBe(expectedActorPath);
			expect(modifier.sourceFiles!.some((file) => file.name.startsWith('actors/TypeScript-Actor/'))).toBe(false);
		});
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

	it.each([
		['is the Actor folder itself', { dockerContextDir: '..' }, []],
		[
			'lies inside it, with a Dockerfile there',
			{ dockerContextDir: '../src', dockerfile: '../src/Dockerfile' },
			['src/Dockerfile'],
		],
		['is not set', {}, []],
	])('pushes the Actor folder as usual when the Docker context %s', async (_, fields, extraFiles) => {
		for (const file of extraFiles) await write(`${ACTOR_PATH}/${file}`, 'FROM apify/actor-node:20\n');
		await writeActorConfig(fields);

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		expect(process.exitCode).toBeFalsy();
		const modifier = versionPayload(versionUpdate);
		expect(modifier.sourceType).toBe(ACTOR_SOURCE_TYPES.SOURCE_FILES);
		expect(modifier.sourceFiles!.map((file) => file.name).sort()).toEqual(
			['.actor/actor.json', 'src/index.ts', ...extraFiles].sort(),
		);
		expect(modifier).not.toHaveProperty('actorPath');
		expect(logMessages.log.join('\n')).toContain('Apify push result: SUCCEEDED');
	});

	it('pushes each Actor with --all from the repository root, a monorepo one as the root with its own actorPath', async () => {
		const SECOND_ACTOR_PATH = 'actors/python-actor';
		const PLAIN_ACTOR_PATH = 'tools/plain-actor';
		await write(
			`${SECOND_ACTOR_PATH}/.actor/actor.json`,
			JSON.stringify({
				actorSpecification: 1,
				name: 'push-monorepo-python',
				version: '0.0',
				buildTag: 'latest',
				dockerContextDir: '../../..',
				dockerfile: '../../../shared/TypeScript_Dockerfile',
			}),
		);
		await write(`${SECOND_ACTOR_PATH}/main.py`, 'print(1)\n');
		// Without dockerContextDir, an Actor in the same repository pushes its own folder.
		await write(
			`${PLAIN_ACTOR_PATH}/.actor/actor.json`,
			JSON.stringify({ actorSpecification: 1, name: 'push-plain', version: '0.0', buildTag: 'latest' }),
		);
		await write(`${PLAIN_ACTOR_PATH}/main.js`, 'console.log(1);\n');
		git('add', '.');
		git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'more Actors');
		forceNewCwd('.');

		await testRunCommand(ActorsPushCommand, { flags_all: true });

		expect(commandProcess.exitCode).toBeFalsy();
		expect(versionUpdate).toHaveBeenCalledTimes(3);
		const [second, first, plain] = versionUpdate.mock.calls.map(([modifier]) => modifier as VersionPayload);
		expect(second.actorPath).toBe(SECOND_ACTOR_PATH);
		expect(first.actorPath).toBe(ACTOR_PATH);
		for (const modifier of [second, first]) {
			expect(modifier.sourceFiles!.map((file) => file.name)).toEqual(
				expect.arrayContaining([
					`${SECOND_ACTOR_PATH}/.actor/actor.json`,
					`${ACTOR_PATH}/.actor/actor.json`,
					'shared/TypeScript_Dockerfile',
				]),
			);
		}
		expect(plain).not.toHaveProperty('actorPath');
		expect(plain.sourceFiles!.map((file) => file.name).sort()).toEqual(['.actor/actor.json', 'main.js']);
	});
});
