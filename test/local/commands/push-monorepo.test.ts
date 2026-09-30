import { execFileSync } from 'node:child_process';
import { chmod, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { ACTOR_SOURCE_TYPES } from '@apify/consts';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { CommandExitCodes } from '../../../src/lib/consts.js';
import { cwdCache } from '../../../src/lib/hooks/useActorConfig.js';
import { MONOREPO_PLATFORM_SUPPORT_ISSUE_URL } from '../../../src/lib/runtime/source-context.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const actName = 'push-monorepo-actor';
const ACTOR_ID = 'mOnO1234efGh';
const ACTOR_PATH = 'actors/typescript-actor';
const RUNTIME_BASE_URL = 'http://localhost:3333/v2';
const CLOUD_BASE_URL = 'https://api.apify.com/v2';

const actor = {
	id: ACTOR_ID,
	name: actName,
	modifiedAt: new Date(0),
	taggedBuilds: { latest: { buildId: 'build1' } },
};
const build = { id: 'build1', actId: ACTOR_ID, buildNumber: '0.0.1', status: 'SUCCEEDED' };
const currentVersion = { versionNumber: '0.0', sourceType: ACTOR_SOURCE_TYPES.SOURCE_FILES };

let baseUrl = RUNTIME_BASE_URL;
/** `null` makes the pushed version a new one. */
let existingVersion: typeof currentVersion | null = currentVersion;
const versionUpdates: unknown[] = [];
const versionCreates: unknown[] = [];
const versionDeletes = vitest.fn(async () => {});
const actorDeletes = vitest.fn(async () => {});
const actorGets = vitest.fn(async () => actor);

vitest.mock('../../../src/lib/utils.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/utils.js')>()),
	getLocalUserInfo: vitest.fn(async () => ({ id: 'userId', username: 'user' })),
	outputJobLog: vitest.fn(async () => {}),
	getLoggedClientOrThrow: vitest.fn(async () => ({
		baseUrl,
		token: 'my-token',
		actor: () => ({
			get: actorGets,
			delete: actorDeletes,
			version: () => ({
				get: async () => existingVersion,
				update: async (modifier: unknown) => {
					versionUpdates.push(modifier);
					return {};
				},
				delete: versionDeletes,
			}),
			versions: () => ({
				create: async (created: unknown) => {
					versionCreates.push(created);
					return created;
				},
			}),
			build: async () => build,
		}),
		build: () => ({ get: async () => build }),
	})),
}));

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

/** Answers the runtime's source-context and dev-folder endpoints; `sourceContextResponse` overrides the former. */
let sourceContextResponse: (() => Response) | undefined;
const fetchMock = vitest.fn<typeof fetch>(async (url) => {
	if (String(url).includes('/actor-runtime/source-context/') && sourceContextResponse) return sourceContextResponse();
	return new Response(JSON.stringify({ data: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
});

function callsTo(endpoint: string) {
	return fetchMock.mock.calls
		.filter(([url]) => String(url).includes(`/actor-runtime/${endpoint}/`))
		.map(([url, init]) => ({ url: String(url), method: init?.method, body: JSON.parse(init?.body as string) }));
}

/** The regular files of a `.tar.gz` and their permission bits, by name - a plain ustar reader is enough for what `archiver` writes. */
function untar(gzipped: Uint8Array): {
	files: Map<string, string>;
	modes: Map<string, number>;
	links: Map<string, string>;
} {
	const archive = gunzipSync(gzipped);
	const files = new Map<string, string>();
	const modes = new Map<string, number>();
	const links = new Map<string, string>();
	for (let offset = 0; offset + 512 <= archive.length;) {
		const header = archive.subarray(offset, offset + 512);
		const field = (start: number, length: number) => {
			const raw = header.subarray(start, start + length);
			const end = raw.indexOf(0);
			return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8');
		};
		const name = field(0, 100);
		if (!name) break;
		const prefix = field(345, 155);
		const size = Number.parseInt(field(124, 12).trim() || '0', 8);
		const type = field(156, 1);
		const content = archive.subarray(offset + 512, offset + 512 + size).toString('utf8');
		if (type === '2') links.set(prefix ? `${prefix}/${name}` : name, field(157, 100));
		if (type === '0' || type === '') {
			const path = prefix ? `${prefix}/${name}` : name;
			files.set(path, content);
			modes.set(path, Number.parseInt(field(100, 8).trim() || '0', 8) & 0o777);
		}
		offset += 512 + Math.ceil(size / 512) * 512;
	}
	return { files, modes, links };
}

/** The one source-context upload: its URL and query, and the files of its tarball body. */
function sourceContextUpload() {
	const [[url, init]] = fetchMock.mock.calls.filter(([u]) => String(u).includes('/actor-runtime/source-context/'));
	const parsed = new URL(String(url));
	return {
		path: `${parsed.origin}${parsed.pathname}`,
		method: init?.method,
		contentType: (init!.headers as Record<string, string>)['Content-Type'],
		query: Object.fromEntries(parsed.searchParams),
		...untar(init?.body as Uint8Array),
	};
}

async function write(relativePath: string, content: string) {
	await mkdir(dirname(joinPath(relativePath)), { recursive: true });
	await writeFile(joinPath(relativePath), content);
}

function git(...args: string[]) {
	execFileSync('git', args, { cwd: tmpPath, stdio: 'ignore' });
}

let originalExitCode: typeof process.exitCode;

beforeEach(async () => {
	originalExitCode = commandProcess.exitCode;
	baseUrl = RUNTIME_BASE_URL;
	sourceContextResponse = undefined;
	versionUpdates.length = 0;
	versionCreates.length = 0;
	existingVersion = currentVersion;
	versionDeletes.mockClear();
	actorDeletes.mockClear();
	actorGets.mockClear();
	cwdCache.clear();
	fetchMock.mockClear();
	vitest.stubGlobal('fetch', fetchMock);
	await beforeAllCalls();

	// The layout of apify/actor-monorepo-example, as its own Git repository.
	await write('package.json', '{"workspaces":["actors/**","packages/**"]}');
	await write('.gitignore', 'node_modules\n');
	await write('shared/TypeScript_Dockerfile', 'FROM apify/actor-node:20\n');
	await write('packages/typescript-utils/src/index.ts', 'export const x = 1;\n');
	await write('node_modules/ignored/index.js', '');
	await write(
		`${ACTOR_PATH}/.actor/actor.json`,
		JSON.stringify({
			actorSpecification: 1,
			name: actName,
			version: '0.0',
			buildTag: 'latest',
			dockerContextDir: '../../..',
			dockerfile: '../../../shared/TypeScript_Dockerfile',
		}),
	);
	await write(`${ACTOR_PATH}/src/index.ts`, 'console.log(1);\n');
	git('init', '--quiet', '--initial-branch=main');
	git('remote', 'add', 'origin', 'https://someone:secret-token@github.com/acme/monorepo.git');
	git('add', '.');
	git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'init');

	forceNewCwd(ACTOR_PATH);
});

afterEach(async () => {
	vitest.unstubAllGlobals();
	commandProcess.exitCode = originalExitCode;
	await afterAllCalls();
});

describe('apify push of a monorepo Actor to a local Actor runtime', () => {
	it('pushes the whole Docker context, with the Actor path and the Git details', async () => {
		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		const upload = sourceContextUpload();
		expect(upload.path).toBe(`${RUNTIME_BASE_URL}/actor-runtime/source-context/${ACTOR_ID}/0.0`);
		expect(upload.method).toBe('PUT');
		expect(upload.contentType).toBe('application/gzip');
		expect(upload.query).toMatchObject({
			actorPath: ACTOR_PATH,
			gitBranch: 'main',
			gitRemoteUrl: 'https://github.com/acme/monorepo.git',
			gitDirty: 'false',
		});
		expect(upload.query.gitCommit).toMatch(/^[0-9a-f]{40}$/);
		const names = [...upload.files.keys()];
		expect(names).toEqual(
			expect.arrayContaining([
				'package.json',
				'shared/TypeScript_Dockerfile',
				'packages/typescript-utils/src/index.ts',
				`${ACTOR_PATH}/.actor/actor.json`,
				`${ACTOR_PATH}/src/index.ts`,
			]),
		);
		expect(names.some((name) => name.startsWith('node_modules'))).toBe(false);

		// The version update carries no files of its own; the context replaces them.
		expect(versionUpdates).toEqual([expect.not.objectContaining({ sourceFiles: expect.anything() })]);
		// The dev folder is the context root, so a run mounts the whole workspace.
		expect(callsTo('dev-folder').map((c) => c.body)).toEqual([tmpPath]);
		expect(logMessages.log.join('\n')).toContain('Apify push result: SUCCEEDED');
	});

	it('pushes the working copy as it is on disk, uncommitted and untracked files included', async () => {
		await write(`${ACTOR_PATH}/src/index.ts`, 'console.log(2);\n');
		await write('packages/typescript-utils/src/new.ts', 'export const y = 2;\n');

		await testRunCommand(ActorsPushCommand, {});

		const { files, query } = sourceContextUpload();
		expect(files.get(`${ACTOR_PATH}/src/index.ts`)).toBe('console.log(2);\n');
		expect(files.get('packages/typescript-utils/src/new.ts')).toBe('export const y = 2;\n');
		expect(query.gitDirty).toBe('true');
	});

	it('asks to update a runtime that has no source-context endpoint', async () => {
		sourceContextResponse = () =>
			new Response(JSON.stringify({ error: { type: 'not-found', message: 'Not found' } }), { status: 404 });

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.NotImplemented);
		expect(logMessages.error.join('\n')).toContain(`update it with 'apify runtime install'`);
		expect(logMessages.error.join('\n')).not.toContain('apify runtime connect');
		expect(callsTo('dev-folder')).toEqual([]);
		// The existing version is left as it was.
		expect(versionUpdates).toEqual([]);
	});

	it('creates a new version before pushing its context, and removes it again when the push fails', async () => {
		existingVersion = null;

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBeFalsy();
		expect(versionCreates).toEqual([expect.objectContaining({ versionNumber: '0.0', buildTag: 'latest' })]);
		expect(sourceContextUpload().query.actorPath).toBe(ACTOR_PATH);
		expect(versionDeletes).not.toHaveBeenCalled();

		fetchMock.mockClear();
		cwdCache.clear();
		sourceContextResponse = () =>
			new Response(JSON.stringify({ error: { type: 'invalid-request', message: 'Archive is broken' } }), {
				status: 400,
			});

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.BuildFailed);
		expect(logMessages.error.join('\n')).toContain('Could not push the Docker context');
		expect(logMessages.error.join('\n')).toContain('Archive is broken');
		expect(versionDeletes).toHaveBeenCalledOnce();
		expect(callsTo('dev-folder')).toEqual([]);
	});

	it('pushes the files a Git clone has, as they are on disk, and not what .actorignore changes', async () => {
		// `dist` is git-ignored: the platform's clone has no `dist`, whatever .actorignore force-includes.
		await write(`${ACTOR_PATH}/.gitignore`, 'dist\n');
		await write(`${ACTOR_PATH}/.actorignore`, '!dist/\nsrc/index.ts\n');
		await write(`${ACTOR_PATH}/dist/main.js`, 'console.log(3);\n');
		await write('shared/start.sh', '#!/bin/sh\necho hi\n');
		await chmod(joinPath('shared/start.sh'), 0o755);
		await rm(joinPath('packages/typescript-utils/src/index.ts'));

		await testRunCommand(ActorsPushCommand, {});

		const { files, modes } = sourceContextUpload();
		const names = [...files.keys()];
		expect(names).not.toContain(`${ACTOR_PATH}/dist/main.js`);
		// Tracked, so in the clone, although .actorignore excludes it.
		expect(names).toContain(`${ACTOR_PATH}/src/index.ts`);
		// Deleted locally, so not pushed although still committed.
		expect(names).not.toContain('packages/typescript-utils/src/index.ts');
		// Untracked and not ignored: pushed, with a warning that the platform would not have it yet.
		expect(names).toContain('shared/start.sh');
		expect(modes.get('shared/start.sh')).toBe(0o755);
		expect(logMessages.error.join('\n')).toContain('changes that are not committed');
	});

	it('rejects a dockerContextDir outside the Git repository, which the platform could not build', async () => {
		await write(
			`${ACTOR_PATH}/.actor/actor.json`,
			JSON.stringify({ actorSpecification: 1, name: actName, version: '0.0', dockerContextDir: '../../../..' }),
		);

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		expect(logMessages.error.join('\n')).toContain('outside the Git repository');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('pushes the whole repository, like a clone, when the Docker context is only part of it', async () => {
		await write(
			`${ACTOR_PATH}/.actor/actor.json`,
			(await readFile(joinPath(`${ACTOR_PATH}/.actor/actor.json`), 'utf8')).replace('"../../.."', '"../.."'),
		);

		await testRunCommand(ActorsPushCommand, {});

		const { files, query } = sourceContextUpload();
		// The Actor's path is relative to the repository, as the folder part of a Git source URL is.
		expect(query.actorPath).toBe(ACTOR_PATH);
		expect([...files.keys()]).toEqual(expect.arrayContaining(['package.json', 'shared/TypeScript_Dockerfile']));
		// The image holds the context, so that is the dev folder.
		expect(callsTo('dev-folder').map((c) => c.body)).toEqual([joinPath('actors')]);
	});

	it('keeps a symlink a link, as a Git clone does', async () => {
		await symlink('../../shared', joinPath(`${ACTOR_PATH}/shared`));

		await testRunCommand(ActorsPushCommand, {});

		expect(sourceContextUpload().links.get(`${ACTOR_PATH}/shared`)).toBe('../../shared');
	});

	it('rejects a dockerContextDir that does not contain the Actor', async () => {
		await write(
			`${ACTOR_PATH}/.actor/actor.json`,
			JSON.stringify({ actorSpecification: 1, name: actName, version: '0.0', dockerContextDir: '../src' }),
		);

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		expect(logMessages.error.join('\n')).toContain(`which does not contain the Actor's folder`);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('apify push of a monorepo Actor to the Apify platform', () => {
	it('stops before touching the platform, pointing at the tracking issue', async () => {
		baseUrl = CLOUD_BASE_URL;

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.NotImplemented);
		const errors = logMessages.error.join('\n');
		expect(errors).toContain('does not support such Actors on the Apify platform yet');
		expect(errors).toContain(MONOREPO_PLATFORM_SUPPORT_ISSUE_URL);
		expect(actorGets).not.toHaveBeenCalled();
		expect(versionUpdates).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
