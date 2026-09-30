import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

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
const versionUpdates: unknown[] = [];
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
			version: () => ({
				get: async () => currentVersion,
				update: async (modifier: unknown) => {
					versionUpdates.push(modifier);
					return {};
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
		const [call] = callsTo('source-context');
		expect(call.url).toBe(`${RUNTIME_BASE_URL}/actor-runtime/source-context/${ACTOR_ID}/0.0`);
		expect(call.method).toBe('PUT');
		expect(call.body.actorPath).toBe(ACTOR_PATH);
		const names = (call.body.sourceFiles as { name: string }[]).map((file) => file.name.split('\\').join('/'));
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
		expect(call.body.git).toMatchObject({
			branch: 'main',
			remoteUrl: 'https://github.com/acme/monorepo.git',
			dirty: false,
		});
		expect(call.body.git.commit).toMatch(/^[0-9a-f]{40}$/);

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

		const { body } = callsTo('source-context')[0];
		const files = body.sourceFiles as { name: string; content: string }[];
		const byName = (name: string) => files.find((file) => file.name.split('\\').join('/') === name);
		expect(byName(`${ACTOR_PATH}/src/index.ts`)?.content).toBe('console.log(2);\n');
		expect(byName('packages/typescript-utils/src/new.ts')?.content).toBe('export const y = 2;\n');
		expect(body.git.dirty).toBe(true);
	});

	it('asks to update a runtime that has no source-context endpoint', async () => {
		sourceContextResponse = () =>
			new Response(JSON.stringify({ error: { type: 'not-found', message: 'Not found' } }), { status: 404 });

		await testRunCommand(ActorsPushCommand, {});

		expect(commandProcess.exitCode).toBe(CommandExitCodes.NotImplemented);
		expect(logMessages.error.join('\n')).toContain(`update it with 'apify runtime install'`);
		expect(callsTo('dev-folder')).toEqual([]);
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
