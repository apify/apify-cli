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

const TEST_DIR = 'apifyignore-no-git-test-dir';
const FOLDERS = ['src', 'docs', 'dist'];
const FILES = ['main.js', 'src/index.js'];
const FILES_TO_GITIGNORE = ['dist/bundle.js'];
const FILES_TO_APIFYIGNORE = ['docs/README.md'];

describe('Utils - .apifyignore with .gitignore fallback (no git)', () => {
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

		FILES.concat(FILES_TO_GITIGNORE, FILES_TO_APIFYIGNORE).forEach((file) =>
			writeFileSync(joinPath(file), 'content', { flag: 'w' }),
		);

		writeFileSync(joinPath('.gitignore'), 'dist/\n', { flag: 'w' });
		writeFileSync(joinPath('.apifyignore'), 'docs/\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude files matched by both .gitignore and .apifyignore', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		FILES.forEach((file) => expect(paths).toContain(file));
		FILES_TO_GITIGNORE.forEach((file) => expect(paths).not.toContain(file));
		FILES_TO_APIFYIGNORE.forEach((file) => expect(paths).not.toContain(file));
	});
});
