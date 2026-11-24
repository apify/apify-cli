import { existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

import AdmZip from 'adm-zip';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { hasGitMetadataSegment } from '../../../src/lib/git-metadata-path.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const ACTOR_NAME = 'git-metadata-test-actor';
const ACTOR_ID = 'git-metadata-actor-id';

let version: Record<string, unknown> = {};
let zipEntries: string[] = [];

const buildZip = () => {
	const zip = new AdmZip();
	zip.addFile('repo-master/', Buffer.alloc(0));
	zip.addFile('repo-master/main.js', Buffer.from('// legitimate\n'));

	for (const name of zipEntries) {
		zip.addFile(`repo-master/${name}`, Buffer.from('[core]\n\tfsmonitor = touch pwned\n'));
	}

	return zip;
};

vitest.mock('../../../src/lib/utils.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/utils.js')>()),
	getCurrentUserInfo: vitest.fn(async () => ({ id: 'testUserId', username: 'testUser' })),
	downloadZip: vitest.fn(async () => buildZip()),
	getLoggedClientOrThrow: vitest.fn(async () => ({
		actor: (_id: string) => ({
			get: async () => ({ id: ACTOR_ID, name: ACTOR_NAME, versions: [version] }),
		}),
	})),
}));

const { tmpPath, beforeAllCalls, afterAllCalls } = useTempPath('pull-git-metadata', {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { logMessages } = useConsoleSpy();

const actorDir = join(tmpPath, ACTOR_NAME);

const { ActorsPullCommand } = await import('../../../src/commands/actors/pull.js');

describe('hasGitMetadataSegment', () => {
	it.each([
		'.git',
		'.git/config',
		'.GIT/HEAD',
		'.Git/config',
		'sub/.git/config',
		'sub/.git',
		'git~1/config',
		'GIT~1/config',
		'.git./config',
		'.git /config',
		'.git::$INDEX_ALLOCATION/config',
		'.git\\config',
		'.g\u200Cit/config',
		'.\u200Dgit/config',
		'.git\u200B/config',
		'sub/.g\uFEFFit',
	])('flags %s', (path) => {
		expect(hasGitMetadataSegment(path)).toBe(true);
	});

	it.each([
		'main.js',
		'.gitignore',
		'.github/workflows/ci.yml',
		'src/.gitkeep',
		'digit/config',
		'git/config',
		'.git-keep',
	])('allows %s', (path) => {
		expect(hasGitMetadataSegment(path)).toBe(false);
	});
});

describe('apify pull: Git metadata in pulled files', () => {
	beforeAll(beforeAllCalls);
	afterAll(afterAllCalls);

	let savedExitCode: typeof process.exitCode;

	beforeEach(() => {
		savedExitCode = process.exitCode;
		process.exitCode = undefined;
		zipEntries = [];
	});

	afterEach(async () => {
		process.exitCode = savedExitCode;
		await rm(actorDir, { recursive: true, force: true });
	});

	const sourceFilesVersion = (names: string[]) => ({
		versionNumber: '0.1',
		sourceType: 'SOURCE_FILES',
		buildTag: 'latest',
		sourceFiles: [
			{ name: 'main.js', format: 'TEXT', content: '// legitimate\n' },
			...names.map((name) => ({ name, format: 'TEXT', content: '[core]\n\tfsmonitor = touch pwned\n' })),
		],
	});

	it.each(['.git/HEAD', '.git/config', '.GIT/config', 'sub/.git/config', 'git~1/config', '.git'])(
		'rejects SOURCE_FILES name %s and writes nothing',
		async (name) => {
			version = sourceFilesVersion([name]);

			await testRunCommand(ActorsPullCommand, { args_actorId: ACTOR_ID });

			expect(logMessages.error.join('\n')).toContain(`source file "${name}" would be written to Git metadata`);
			expect(process.exitCode).toBeTruthy();
			expect(existsSync(join(actorDir, 'main.js'))).toBe(false);
			expect(existsSync(join(actorDir, name))).toBe(false);
		},
	);

	it('writes SOURCE_FILES names that only look like Git metadata', async () => {
		version = sourceFilesVersion(['.gitignore', '.github/ci.yml']);

		await testRunCommand(ActorsPullCommand, { args_actorId: ACTOR_ID });

		expect(process.exitCode).toBeFalsy();
		expect(readFileSync(join(actorDir, '.gitignore'), 'utf8')).toContain('pwned');
		expect(existsSync(join(actorDir, '.github/ci.yml'))).toBe(true);
	});

	it.each(['TARBALL', 'GITHUB_GIST'])(
		'rejects %s archives with .git entries and writes nothing',
		async (sourceType) => {
			version = {
				versionNumber: '0.1',
				sourceType,
				buildTag: 'latest',
				tarballUrl: 'https://example.com/a.zip',
				gitHubGistUrl: 'https://example.com/gist',
			};
			zipEntries = ['.git/config'];

			await testRunCommand(ActorsPullCommand, { args_actorId: ACTOR_ID });

			expect(logMessages.error.join('\n')).toContain('archive entry "repo-master/.git/config" would be written');
			expect(process.exitCode).toBeTruthy();
			expect(existsSync(join(actorDir, 'main.js'))).toBe(false);
			expect(existsSync(join(actorDir, '.git'))).toBe(false);
		},
	);

	it('extracts archives without .git entries', async () => {
		version = {
			versionNumber: '0.1',
			sourceType: 'TARBALL',
			buildTag: 'latest',
			tarballUrl: 'https://example.com/a.zip',
		};

		await testRunCommand(ActorsPullCommand, { args_actorId: ACTOR_ID });

		expect(process.exitCode).toBeFalsy();
		expect(existsSync(join(actorDir, 'main.js'))).toBe(true);
	});
});
