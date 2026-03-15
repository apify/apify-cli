import { writeFileSync } from 'node:fs';

import { ensureFolderExistsSync } from '../../../src/lib/files.js';
import { getActorLocalFilePaths } from '../../../src/lib/utils.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

// Mock execSync to simulate git not being available.
vi.mock('node:child_process', async (importOriginal) => {
	const original = await importOriginal<typeof import('node:child_process')>();
	return {
		...original,
		execSync: () => {
			throw new Error('not a git repository');
		},
	};
});

const TEST_DIR = 'actorignore-no-git-test-dir';
const FOLDERS = ['src', 'docs', 'dist'];
const FILES = ['main.js', 'src/index.js'];
const FILES_TO_GITIGNORE = ['dist/bundle.js'];
const FILES_TO_ACTORIGNORE = ['docs/README.md'];

describe('Utils - .actorignore with .gitignore fallback (no git)', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		FOLDERS.forEach((folder) => {
			ensureFolderExistsSync(tmpPath, folder);
		});

		FILES.concat(FILES_TO_GITIGNORE, FILES_TO_ACTORIGNORE).forEach((file) =>
			writeFileSync(joinPath(file), 'content', { flag: 'w' }),
		);

		writeFileSync(joinPath('.gitignore'), 'dist/\n', { flag: 'w' });
		writeFileSync(joinPath('.actorignore'), 'docs/\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude files matched by both .gitignore and .actorignore', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		FILES.forEach((file) => expect(paths).toContain(file));
		FILES_TO_GITIGNORE.forEach((file) => expect(paths).not.toContain(file));
		FILES_TO_ACTORIGNORE.forEach((file) => expect(paths).not.toContain(file));
	});
});

const NEGATE_NO_GIT_TEST_DIR = 'actorignore-negate-no-git-test-dir';
const NEGATE_FOLDERS = ['src', 'dist'];
const NEGATE_FILES = ['main.js', 'src/index.js'];
const NEGATE_FILES_TO_GITIGNORE = ['dist/bundle.js'];

describe('Utils - .actorignore negation overrides gitignore (no git)', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(NEGATE_NO_GIT_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		NEGATE_FOLDERS.forEach((folder) => {
			ensureFolderExistsSync(tmpPath, folder);
		});

		NEGATE_FILES.concat(NEGATE_FILES_TO_GITIGNORE).forEach((file) =>
			writeFileSync(joinPath(file), 'content', { flag: 'w' }),
		);

		writeFileSync(joinPath('.gitignore'), 'dist/\n', { flag: 'w' });
		// .actorignore force-includes dist/ (overrides gitignore)
		writeFileSync(joinPath('.actorignore'), '!dist/\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should include gitignored files that match negation patterns in .actorignore', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		NEGATE_FILES.forEach((file) => expect(paths).toContain(file));
		// dist/bundle.js is gitignored but force-included by .actorignore
		NEGATE_FILES_TO_GITIGNORE.forEach((file) => expect(paths).toContain(file));
	});
});
