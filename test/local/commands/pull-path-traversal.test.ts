import { existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const ACTOR_NAME = 'traversal-test-actor';
const ACTOR_ID = 'traversal-actor-id';

let secondFileName = '';
let secondFileContent = '';

vitest.mock('../../../src/lib/utils.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/utils.js')>()),
	getCurrentUserInfo: vitest.fn(async () => ({ id: 'testUserId', username: 'testUser' })),
	getLoggedClientOrThrow: vitest.fn(async () => ({
		actor: (_id: string) => ({
			get: async () => ({
				id: ACTOR_ID,
				name: ACTOR_NAME,
				versions: [
					{
						versionNumber: '0.1',
						sourceType: 'SOURCE_FILES',
						buildTag: 'latest',
						sourceFiles: [
							{ name: 'main.js', format: 'TEXT', content: '// legitimate\n' },
							{ name: secondFileName, format: 'TEXT', content: secondFileContent },
						],
					},
				],
			}),
		}),
	})),
}));

const { tmpPath, beforeAllCalls, afterAllCalls } = useTempPath('pull-traversal', {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { logMessages } = useConsoleSpy();

const actorDir = join(tmpPath, ACTOR_NAME);
const isWindows = process.platform === 'win32';

const { ActorsPullCommand } = await import('../../../src/commands/actors/pull.js');

const outsideError = (name: string) =>
	`Cannot pull Actor: source file "${name}" would be written outside the target directory.`;

describe('apify pull: source file names that escape the target directory', () => {
	beforeAll(beforeAllCalls);
	afterAll(afterAllCalls);

	let savedExitCode: typeof process.exitCode;
	let escapedPath: string | undefined;

	beforeEach(() => {
		savedExitCode = process.exitCode;
		process.exitCode = undefined;
		secondFileContent = 'ESCAPED';
		escapedPath = undefined;
	});

	afterEach(async () => {
		process.exitCode = savedExitCode;
		await rm(actorDir, { recursive: true, force: true });

		if (escapedPath) {
			await rm(escapedPath, { force: true });
		}
	});

	const expectBlocked = async (name: string, namesDirectory = false) => {
		secondFileName = name;
		escapedPath = namesDirectory ? undefined : resolve(actorDir, name);

		await testRunCommand(ActorsPullCommand, { args_actorId: ACTOR_ID });

		expect(logMessages.error.join('\n')).toContain(outsideError(name));
		expect(process.exitCode).toBeTruthy();
		expect(existsSync(join(actorDir, 'main.js'))).toBe(false);

		if (escapedPath) {
			expect(existsSync(escapedPath)).toBe(false);
		}
	};

	const expectWritten = async (name: string, writtenAt: string) => {
		secondFileName = name;

		await testRunCommand(ActorsPullCommand, { args_actorId: ACTOR_ID });

		expect(logMessages.error.join('\n')).not.toContain('Cannot pull Actor');
		expect(process.exitCode).toBeFalsy();
		expect(existsSync(join(actorDir, 'main.js'))).toBe(true);
		expect(existsSync(join(actorDir, writtenAt))).toBe(true);
	};

	it.each([
		['parent traversal', '../../outside.txt'],
		['sibling of the target directory', '../sibling.txt'],
		['traversal after a nested segment', 'foo/../../../deep-escape.txt'],
		['absolute path', resolve(tmpPath, 'absolute-escape.txt')],
	])('rejects %s and writes nothing', async (_label, name) => {
		await expectBlocked(name);
	});

	it.each([
		['parent directory itself', '..'],
		['target directory itself', '.'],
		['name that normalises to the target directory', 'src/..'],
	])('rejects %s and writes nothing', async (_label, name) => {
		await expectBlocked(name, true);
	});

	it.each([
		['nested directories', 'src/nested/safe.js', 'src/nested/safe.js'],
		['name that starts with two dots', '..foo.js', '..foo.js'],
		['name that normalises inside the target directory', 'src/../lib/normalised.js', 'lib/normalised.js'],
	])('writes %s inside the target directory', async (_label, name, writtenAt) => {
		await expectWritten(name, writtenAt);
	});

	it('writes .actor/actor.json with the Actor name', async () => {
		secondFileContent = '{ "actorSpecification": 1, "name": "old-name", "version": "0.1" }';

		await expectWritten('.actor/actor.json', '.actor/actor.json');

		expect(JSON.parse(readFileSync(join(actorDir, '.actor/actor.json'), 'utf8')).name).toBe(ACTOR_NAME);
	});

	// Backslash is a path separator only on Windows; elsewhere it is a plain file name character.
	it.each([
		['backslash traversal', '..\\..\\backslash-escape.txt'],
		['drive-letter path', 'Z:\\outside\\drive-escape.txt'],
	])('handles %s for the current platform', async (_label, name) => {
		if (isWindows) {
			await expectBlocked(name);
		} else {
			await expectWritten(name, name);
		}
	});
});
