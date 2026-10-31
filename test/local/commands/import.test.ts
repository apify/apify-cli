import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

import { execa } from 'execa';

import { ACTOR_SOURCE_TYPES } from '@apify/consts';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { LOCAL_CONFIG_PATH } from '../../../src/lib/consts.js';
import { setLocalConfig } from '../../../src/lib/utils.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

// The non-interactive path, so the switch prompt fails instead of blocking on stdin.
vitest.mock('ci-info', async (importOriginal) => ({
	...(await importOriginal<typeof import('ci-info')>()),
	isCI: true,
}));

const ACTOR_ID = 'aBcD1234efGh';
const REPO = 'git@github.com:apify/actor-monorepo-example.git';

let existingVersion: Record<string, unknown> | undefined;
const actorsCreate = vitest.fn(async (actor: { name: string }) => ({ id: ACTOR_ID, name: actor.name }));
const versionUpdate = vitest.fn(async () => ({}));

// Stands in for the platform: the Actor exists only when a test gives it a version.
vitest.mock('../../../src/lib/utils.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/utils.js')>()),
	getCurrentUserInfo: vitest.fn(async () => ({ id: 'userId', username: 'user' })),
	getLoggedClientOrThrow: vitest.fn(async () => ({
		baseUrl: 'https://api.apify.com/v2',
		token: 'token',
		actors: () => ({ create: actorsCreate }),
		actor: () => ({
			get: async () => (existingVersion ? { id: ACTOR_ID, name: 'my-actor', username: 'user' } : undefined),
			version: () => ({ get: async () => existingVersion, update: versionUpdate }),
		}),
	})),
}));

const { beforeAllCalls, afterAllCalls, joinPath } = useTempPath('import-monorepo', {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { logMessages } = useConsoleSpy();

const { default: mockedProcess } = await import('node:process');
const { ImportCommand } = await import('../../../src/commands/import.js');
const { CreateCommand } = await import('../../../src/commands/create.js');

let fetchMock: ReturnType<typeof vitest.spyOn>;

beforeEach(async () => {
	await beforeAllCalls();
	// A repository shaped like apify/actor-monorepo-example, with a token in its HTTPS origin.
	await execa('git', ['init', '-b', 'main', '--template='], { cwd: joinPath() });
	await execa('git', ['remote', 'add', 'origin', 'https://user:secret@github.com/apify/actor-monorepo-example.git'], {
		cwd: joinPath(),
	});
	await mkdir(joinPath('actors', 'x'), { recursive: true });
	await setLocalConfig({ actorSpecification: 1, name: 'my-actor', version: '0.1' }, joinPath('actors', 'x'));

	fetchMock = vitest
		.spyOn(globalThis, 'fetch')
		.mockImplementation(async (url) =>
			String(url).endsWith('/integrations/git')
				? Response.json({ data: [{ id: 'github-app', provider: 'github', workspaces: [{ id: '1', label: 'apify' }] }] })
				: new Response(null, { status: 204 }),
		);
});

afterEach(async () => {
	fetchMock.mockRestore();
	actorsCreate.mockClear();
	versionUpdate.mockClear();
	existingVersion = undefined;
	mockedProcess.exitCode = undefined;
	await afterAllCalls();
});

it('creates an Actor that builds from its monorepo folder', async () => {
	await testRunCommand(ImportCommand, { flags_dir: 'actors/x', flags_json: true });

	expect(actorsCreate).toHaveBeenCalledWith({
		name: 'my-actor',
		versions: [
			{
				versionNumber: '0.1',
				buildTag: 'latest',
				sourceType: ACTOR_SOURCE_TYPES.GIT_REPO,
				gitRepoUrl: `${REPO}#main:actors/x`,
			},
		],
	});

	const calls = fetchMock.mock.calls.map(([url, init]) => [String(url), init?.body && JSON.parse(String(init.body))]);
	expect(calls).toContainEqual([
		'https://api.apify.com/v2/integrations/git/github-app/register-deployment-key',
		{ actorId: ACTOR_ID, repoName: 'https://github.com/apify/actor-monorepo-example' },
	]);
	expect(calls).toContainEqual([
		`https://api.apify.com/v2/actors/${ACTOR_ID}/versions/0.1/build-on-push`,
		{ providerId: 'github-app', enabled: true },
	]);

	expect(JSON.parse(logMessages.log.join('\n'))).toEqual({
		actor: { id: ACTOR_ID, name: 'my-actor', url: `https://console.apify.com/actors/${ACTOR_ID}` },
		source: { type: 'git', gitRepoUrl: `${REPO}#main:actors/x`, versionNumber: '0.1', automaticBuilds: 'on' },
	});
	expect(logMessages.log.join('\n')).not.toContain('secret');
	expect(JSON.parse(readFileSync(joinPath('actors', 'x', LOCAL_CONFIG_PATH), 'utf8')).name).toBe('my-actor');
});

it('create --import refuses to switch another Git source without --force', async () => {
	existingVersion = { sourceType: ACTOR_SOURCE_TYPES.GIT_REPO, gitRepoUrl: 'git@github.com:apify/other.git#main' };

	await testRunCommand(CreateCommand, { args_actorName: 'my-actor', flags_import: true, flags_source: 'github' });

	expect(mockedProcess.exitCode).toBe(5);
	expect(logMessages.error.join('\n')).toContain('use --force');
	expect(versionUpdate).not.toHaveBeenCalled();
});

it('does not ask to switch when Console stored the same repository in HTTPS form', async () => {
	existingVersion = {
		sourceType: ACTOR_SOURCE_TYPES.GIT_REPO,
		gitRepoUrl: 'https://github.com/apify/actor-monorepo-example.git#main:actors/x',
	};

	await testRunCommand(ImportCommand, { flags_dir: 'actors/x' });

	expect(mockedProcess.exitCode).toBeUndefined();
	expect(logMessages.error.join('\n')).not.toContain('another Git source');
	expect(versionUpdate).toHaveBeenCalled();
});
