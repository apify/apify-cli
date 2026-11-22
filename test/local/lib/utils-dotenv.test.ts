import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { getActorLocalFilePaths, isDotEnvFile } from '../../../src/lib/utils.js';
import { useIsolatedGit } from '../../__setup__/hooks/useIsolatedGit.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

useIsolatedGit('utils-dotenv-git-home');

const DOTENV_FILES = ['.env', '.env.local', '.env.production', 'src/.env', '.actor/.env', '.actor/.env.local'];

describe('isDotEnvFile', () => {
	it.each(DOTENV_FILES)('is true for %s', (filePath) => {
		expect(isDotEnvFile(filePath)).toBe(true);
	});

	it.each(['.env.example', 'src/.env.example', '.envrc', 'env', 'my.env', '.env/bin/python', 'src/main.js'])(
		'is false for %s',
		(filePath) => {
			expect(isDotEnvFile(filePath)).toBe(false);
		},
	);
});

describe('getActorLocalFilePaths - .env files (git)', () => {
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath('utils-dotenv-test-dir', {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	const write = (actor: string, relativePath: string) => {
		mkdirSync(dirname(joinPath(actor, relativePath)), { recursive: true });
		writeFileSync(joinPath(actor, relativePath), 'A=1\n');
	};

	beforeAll(async () => {
		await beforeAllCalls();

		for (const actor of ['plain', 'negated']) {
			for (const file of [...DOTENV_FILES, '.env.example', 'main.js', '.actor/actor.json', '.gitignore']) {
				write(actor, file);
			}
			// The Actor's own repository, so the ignore rules of this checkout don't apply.
			execFileSync('git', ['init', '--quiet'], { cwd: joinPath(actor), stdio: 'ignore' });
		}
		// Git-ignored, as apify init and apify create set it up, so only the negation could bring them back.
		writeFileSync(joinPath('negated', '.gitignore'), '.env\n.env.local\n');
		writeFileSync(joinPath('negated', '.actorignore'), '!.env\n!.env.local\n');
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('leaves out .env files that Git does not ignore, in the root, below it and under .actor/', async () => {
		const paths = await getActorLocalFilePaths(joinPath('plain'));

		expect(paths).toEqual(expect.arrayContaining(['main.js', '.actor/actor.json', '.env.example']));
		for (const file of DOTENV_FILES) {
			expect(paths).not.toContain(file);
		}
	});

	it('leaves out .env files that .actorignore negates', async () => {
		const paths = await getActorLocalFilePaths(joinPath('negated'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('.env');
		expect(paths).not.toContain('.env.local');
	});
});
