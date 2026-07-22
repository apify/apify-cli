import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getInstallCommandSuggestion } from '../../../../src/lib/hooks/runtimes/utils.js';
import { cwdCache } from '../../../../src/lib/hooks/useCwdProject.js';

const testDir = join(fileURLToPath(import.meta.url), '..', '..', '..', '..', 'tmp', 'install-command-suggestion-test');

async function createFileIn(baseDir: string, relativePath: string, content = '') {
	await mkdir(join(baseDir, ...relativePath.split('/').slice(0, -1)), { recursive: true });
	await writeFile(join(baseDir, relativePath), content);
}

describe('getInstallCommandSuggestion', () => {
	beforeEach(async () => {
		await rm(testDir, { recursive: true, force: true });
		await mkdir(testDir, { recursive: true });
		cwdCache.clear();
	});

	afterAll(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it('suggests "uv sync" for a uv-managed Python project', async () => {
		await createFileIn(testDir, 'my_package/__init__.py');
		await createFileIn(testDir, 'my_package/__main__.py', 'print("hello")');
		await createFileIn(testDir, 'uv.lock', '');

		expect(await getInstallCommandSuggestion(testDir)).toBe('uv sync');
	});

	it('suggests pip install for a Python project without uv.lock', async () => {
		await createFileIn(testDir, 'my_package/__init__.py');
		await createFileIn(testDir, 'my_package/__main__.py', 'print("hello")');

		expect(await getInstallCommandSuggestion(testDir)).toBe('python -m pip install -r requirements.txt');
	});

	it('suggests npm install for a JavaScript project without a lockfile', async () => {
		await createFileIn(testDir, 'package.json', '{"name": "test", "scripts": {"start": "node index.js"}}');

		expect(await getInstallCommandSuggestion(testDir)).toBe('npm install');
	});
});
