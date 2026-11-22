import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
	ensureGitignoreEntries,
	getActorLocalFilePaths,
	isDotEnvFile,
	isTrackedByGit,
	setLocalEnv,
} from '../../../src/lib/utils.js';
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

describe('ensureGitignoreEntries', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'gitignore-entries-test-'));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const gitignore = () => readFileSync(join(dir, '.gitignore'), 'utf8');

	it('creates .gitignore with the entries', () => {
		expect(ensureGitignoreEntries(dir, ['.env', 'node_modules'])).toEqual(['.env', 'node_modules']);
		expect(gitignore()).toBe('.env\nnode_modules\n');
	});

	it('appends only the missing entries, once', () => {
		writeFileSync(join(dir, '.gitignore'), 'node_modules\n.env.local\n');

		expect(ensureGitignoreEntries(dir, ['node_modules', '.env'])).toEqual(['.env']);
		expect(ensureGitignoreEntries(dir, ['node_modules', '.env'])).toEqual([]);
		expect(gitignore()).toBe('node_modules\n.env.local\n\n# Added by Apify CLI\n.env\n');
	});

	it('leaves setLocalEnv adding the required entries once', async () => {
		writeFileSync(join(dir, '.gitignore'), 'node_modules\n');

		await setLocalEnv(dir);
		await setLocalEnv(dir);

		expect(gitignore()).toBe('node_modules\n\n# Added by Apify CLI\nstorage\n.venv\n.env\n');
	});
});

describe('isTrackedByGit', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'tracked-by-git-test-'));
		writeFileSync(join(dir, '.env'), 'A=1\n');
		writeFileSync(join(dir, 'other.txt'), 'x\n');
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const git = (...args: string[]) =>
		execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
			cwd: dir,
			stdio: 'ignore',
		});

	it('is true for a committed file and false for an untracked one', () => {
		git('init', '--quiet');
		git('add', '.env');
		git('commit', '--quiet', '-m', 'init');

		expect(isTrackedByGit(dir, '.env')).toBe(true);
		expect(isTrackedByGit(dir, 'other.txt')).toBe(false);
	});

	it('is false outside Git', () => {
		expect(isTrackedByGit(dir, '.env')).toBe(false);
	});
});
