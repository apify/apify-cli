import { writeFileSync } from 'node:fs';

import { ensureFolderExistsSync } from '../../../src/lib/files.js';
import { getActorLocalFilePaths } from '../../../src/lib/utils.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

// Mock execSync to simulate git not being available.
// vi.mock is hoisted before imports, so utils.ts gets the mocked version.
vi.mock('node:child_process', async (importOriginal) => {
	const original = await importOriginal<typeof import('node:child_process')>();
	return {
		...original,
		execSync: () => {
			throw new Error('not a git repository');
		},
	};
});

const TEST_DIR = 'gitignore-fallback-test-dir';
const FOLDERS = ['src', 'src/utils'];
const FOLDERS_TO_IGNORE = ['dist', 'src/generated'];
const FILES = ['main.js', 'src/index.js', 'src/utils/helper.js'];
const FILES_IN_IGNORED_DIR = ['dist/bundle.js', 'src/generated/types.js'];
const FILES_TO_IGNORE = ['debug.log'];

describe('Utils - gitignore fallback (no git)', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		// NOTE: No git init here — execSync is mocked to throw, triggering the fallback path.

		FOLDERS.concat(FOLDERS_TO_IGNORE).forEach((folder) => {
			ensureFolderExistsSync(tmpPath, folder);
		});

		FILES.concat(FILES_TO_IGNORE, FILES_IN_IGNORED_DIR).forEach((file) =>
			writeFileSync(joinPath(file), 'content', { flag: 'w' }),
		);

		const toIgnore = FOLDERS_TO_IGNORE.concat(FILES_TO_IGNORE).join('\n');
		writeFileSync(joinPath('.gitignore'), toIgnore, { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude files listed in .gitignore when git is unavailable', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		FILES.forEach((file) => expect(paths).toContain(file));
		FILES_IN_IGNORED_DIR.concat(FILES_TO_IGNORE).forEach((file) => expect(paths).not.toContain(file));
	});
});
