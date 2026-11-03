import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import AdmZip from 'adm-zip';

import { ACTOR_SOURCE_TYPES } from '@apify/consts';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { CommandExitCodes } from '../../../src/lib/consts.js';
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
const setRecord = vitest.fn(async (_record: { value: Buffer }) => {});
const zipPaths: string[] = [];
const sourceRoots: string[] = [];
const keyValueStoreGetOrCreate = vitest.fn(async () => ({ id: 'store1' }));

// Stands in for the platform: the Actor and its version exist, and every write is recorded.
vitest.mock('../../../src/lib/utils.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/utils.js')>()),
	getCurrentUserInfo: vitest.fn(async () => ({ id: 'userId', username: 'user' })),
	outputJobLog: vitest.fn(async () => {}),
	createActZip: async (zipPath: string, files: string[], root: string) => {
		zipPaths.push(zipPath);
		sourceRoots.push(root);
		const { createActZip } = await importOriginal<typeof import('../../../src/lib/utils.js')>();
		return createActZip(zipPath, files, root);
	},
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
		keyValueStore: () => ({ setRecord }),
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
	setRecord.mockReset();
	zipPaths.length = 0;
	sourceRoots.length = 0;
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
	function uploadedZip() {
		return new AdmZip(setRecord.mock.calls[0][0].value);
	}

	it('uploads a ZIP with shared sources and hoisted Actor metadata, without changing local files', async () => {
		await write(`${ACTOR_PATH}/.actor/INPUT_SCHEMA.json`, '{"type":"object"}');
		await write('shared/OUTPUT_SCHEMA.json', '{"type":"object"}');
		await write('shared/dataset.json', '{}');
		await write('shared/README.md', '# Shared');
		await writeActorConfig({
			dockerContextDir: '../../..',
			dockerfile: '../../../shared/TypeScript_Dockerfile',
			input: './INPUT_SCHEMA.json',
			output: '../../../shared/OUTPUT_SCHEMA.json',
			readme: '../../../shared/README.md',
			storages: { datasets: { 'named.dataset': '../../../shared/dataset.json' } },
		});
		const original = await readFile(joinPath(`${ACTOR_PATH}/.actor/actor.json`), 'utf8');

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		expect(versionUpdate).toHaveBeenCalledTimes(1);
		expect(versionUpdate.mock.calls[0][0]).toMatchObject({ sourceType: ACTOR_SOURCE_TYPES.TARBALL });
		const zip = uploadedZip();
		expect(zip.getEntries().map((entry) => entry.entryName)).toEqual(
			expect.arrayContaining([
				'package.json',
				'packages/typescript-utils/src/index.ts',
				`${ACTOR_PATH}/src/index.ts`,
				'.actor/actor.json',
				'.actor/INPUT_SCHEMA.json',
				'shared/TypeScript_Dockerfile',
			]),
		);
		expect(JSON.parse(zip.readAsText('.actor/actor.json'))).toMatchObject({
			dockerContextDir: '..',
			dockerfile: '../shared/TypeScript_Dockerfile',
			input: './INPUT_SCHEMA.json',
			output: '../shared/OUTPUT_SCHEMA.json',
			readme: '../shared/README.md',
			storages: { datasets: { 'named.dataset': '../shared/dataset.json' } },
		});
		expect(await readFile(joinPath(`${ACTOR_PATH}/.actor/actor.json`), 'utf8')).toBe(original);
		expect(zipPaths.every((path) => !existsSync(path))).toBe(true);
		expect(sourceRoots.every((path) => !existsSync(path))).toBe(true);
	});

	it('checks newer remote changes against the original files before a monorepo ZIP upload', async () => {
		actorGet.mockResolvedValueOnce(actor).mockResolvedValueOnce({ ...actor, modifiedAt: new Date('2099-01-01') });
		await testRunCommand(ActorsPushCommand, {});
		expect(logMessages.error.join('')).toContain('has newer changes than your local copy');
		expect(setRecord).not.toHaveBeenCalled();
		expect(versionUpdate).not.toHaveBeenCalled();
	});

	it('preserves an inline schema object', async () => {
		await writeActorConfig({
			dockerContextDir: '../../..',
			dockerfile: '../../../shared/TypeScript_Dockerfile',
			input: { type: 'object', properties: { url: { type: 'string' } } },
		});
		await testRunCommand(ActorsPushCommand, {});
		expect(JSON.parse(uploadedZip().readAsText('.actor/actor.json')).input).toEqual({
			type: 'object',
			properties: { url: { type: 'string' } },
		});
	});

	it('keeps the JSON success envelope', async () => {
		await testRunCommand(ActorsPushCommand, { flags_json: true });
		expect(commandProcess.exitCode).toBeFalsy();
		const result = JSON.parse(logMessages.log.join(''));
		expect(result).toMatchObject({ ok: true, operation: 'push', actor: { id: ACTOR_ID } });
	});

	it('pushes by ID without a name', async () => {
		await writeActorConfig({
			name: undefined,
			dockerContextDir: '../../..',
			dockerfile: '../../../shared/TypeScript_Dockerfile',
		});
		await testRunCommand(ActorsPushCommand, { args_actorId: ACTOR_ID });
		expect(commandProcess.exitCode).toBeFalsy();
		expect(versionUpdate).toHaveBeenCalledTimes(1);
	});

	it('cleans up both temporary directories when uploading fails', async () => {
		setRecord.mockRejectedValueOnce(new Error('upload failed'));
		await testRunCommand(ActorsPushCommand, {});
		expect(logMessages.error.join('')).toContain('upload failed');
		expect(versionUpdate).not.toHaveBeenCalled();
		expect(zipPaths).toHaveLength(1);
		expect(sourceRoots).toHaveLength(1);
		expect(zipPaths.every((path) => !existsSync(path))).toBe(true);
		expect(sourceRoots.every((path) => !existsSync(path))).toBe(true);
	});

	it('retains only the selected Actor specification at the upload root', async () => {
		await write('.actor/actor.json', '{"name":"root-actor"}');
		await write('.actor/unrelated-schema.json', '{}');
		await write(`${ACTOR_PATH}/README.md`, '# Selected Actor');
		await write(`${ACTOR_PATH}/.actor/README.md`, '# Preferred metadata README');
		await testRunCommand(ActorsPushCommand, {});
		const zip = uploadedZip();
		expect(zip.getEntry('.actor/unrelated-schema.json')).toBeNull();
		expect(JSON.parse(zip.readAsText('.actor/actor.json'))).toMatchObject({ name: actName, readme: 'README.md' });
	});

	it('preserves fallback files beside the original Actor', async () => {
		await write(`${ACTOR_PATH}/Dockerfile`, 'FROM scratch');
		await write(`${ACTOR_PATH}/README.md`, '# Selected');
		await write(`${ACTOR_PATH}/INPUT_SCHEMA.json`, '{"type":"object"}');
		await writeActorConfig({ dockerContextDir: '../../..' });
		await testRunCommand(ActorsPushCommand, {});
		expect(JSON.parse(uploadedZip().readAsText('.actor/actor.json'))).toMatchObject({
			dockerfile: `../${ACTOR_PATH}/Dockerfile`,
			readme: `../${ACTOR_PATH}/README.md`,
			input: `../${ACTOR_PATH}/INPUT_SCHEMA.json`,
		});
	});

	it('validates missing schema paths before making platform calls', async () => {
		await writeActorConfig({
			dockerContextDir: '../../..',
			dockerfile: '../../../shared/TypeScript_Dockerfile',
			input: '../../../shared/missing.json',
		});
		await testRunCommand(ActorsPushCommand, {});
		expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		expect(actorGet).not.toHaveBeenCalled();
		expect(setRecord).not.toHaveBeenCalled();
	});

	it('keeps Dockerfiles in a nested Docker context instead of moving them outside it', async () => {
		await write(`${ACTOR_PATH}/.actor/Dockerfile`, 'FROM scratch');
		await writeActorConfig({ dockerContextDir: '../..', dockerfile: './Dockerfile' });
		await testRunCommand(ActorsPushCommand, {});
		expect(JSON.parse(uploadedZip().readAsText('.actor/actor.json'))).toMatchObject({
			dockerContextDir: '../actors',
			dockerfile: `../${ACTOR_PATH}/.actor/Dockerfile`,
		});
	});

	it('follows repository-local symlinks but excludes external and dangling links', async () => {
		await symlink('shared/TypeScript_Dockerfile', joinPath('linked-file'));
		await symlink('shared', joinPath('linked-directory'));
		await symlink('missing', joinPath('dangling-link'));
		await symlink('/etc/hostname', joinPath('external-link'));
		await testRunCommand(ActorsPushCommand, {});
		const zip = uploadedZip();
		expect(zip.readAsText('linked-file')).toBe('FROM apify/actor-node:20\n');
		expect(zip.readAsText('linked-directory/TypeScript_Dockerfile')).toBe('FROM apify/actor-node:20\n');
		expect(zip.getEntry('dangling-link')).toBeNull();
		expect(zip.getEntry('external-link')).toBeNull();
	});

	it('honors source-root ignore files while retaining the selected specification', async () => {
		await write('.actorignore', 'excluded.txt\nactors/**/.actor/\n');
		await write('excluded.txt', 'excluded');
		await write('node_modules/secret.txt', 'ignored');
		await testRunCommand(ActorsPushCommand, {});
		const zip = uploadedZip();
		expect(zip.getEntry('excluded.txt')).toBeNull();
		expect(zip.getEntry('node_modules/secret.txt')).toBeNull();
		expect(zip.getEntry('.actor/actor.json')).not.toBeNull();
	});

	it('works without a Git repository using the Docker context as the source root', async () => {
		await rm(joinPath('.git'), { recursive: true });
		vitest.stubEnv('GIT_CEILING_DIRECTORIES', dirname(tmpPath));
		try {
			await testRunCommand(ActorsPushCommand, {});
		} finally {
			vitest.unstubAllEnvs();
		}
		expect(commandProcess.exitCode).toBeFalsy();
		expect(uploadedZip().getEntry('packages/typescript-utils/src/index.ts')).not.toBeNull();
	});

	it('rejects a Dockerfile outside the Docker context before touching the platform', async () => {
		await writeActorConfig({ dockerContextDir: '../..', dockerfile: '../../../shared/TypeScript_Dockerfile' });
		await testRunCommand(ActorsPushCommand, {});
		expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		expect(actorGet).not.toHaveBeenCalled();
		expect(setRecord).not.toHaveBeenCalled();
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
		expect(versionUpdate).toHaveBeenCalledTimes(1);
		const modifier = versionUpdate.mock.calls[0][0] as { sourceType: string; sourceFiles: { name: string }[] };
		expect(modifier.sourceType).toBe(ACTOR_SOURCE_TYPES.SOURCE_FILES);
		expect(modifier.sourceFiles.map((file) => file.name).sort()).toEqual(
			['.actor/actor.json', 'src/index.ts', ...extraFiles].sort(),
		);
		expect(logMessages.log.join('\n')).toContain('Apify push result: SUCCEEDED');
	});
});
