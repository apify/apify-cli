import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { usePythonRuntime } from '../../../src/lib/hooks/runtimes/python.js';

describe('usePythonRuntime', () => {
	let root: string;
	const originalVirtualEnv = process.env.VIRTUAL_ENV;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'apify-cli-python-runtime-'));
		// Otherwise the probe uses $VIRTUAL_ENV and never touches the cwd-derived path.
		delete process.env.VIRTUAL_ENV;
	});

	afterEach(async () => {
		if (originalVirtualEnv === undefined) delete process.env.VIRTUAL_ENV;
		else process.env.VIRTUAL_ENV = originalVirtualEnv;
		delete process.env.APIFY_CLI_PWNED;
		await rm(root, { recursive: true, force: true });
	});

	// POSIX shell syntax; cmd.exe would ignore it either way.
	it.skipIf(process.platform === 'win32')("doesn't run shell syntax from the project directory name", async () => {
		const marker = join(root, 'pwned');
		// Directory names can't contain `/`, so the marker path is smuggled in through the environment.
		process.env.APIFY_CLI_PWNED = marker;
		const cwd = join(root, 'a$(touch "$APIFY_CLI_PWNED")b');
		await mkdir(cwd);

		await usePythonRuntime({ cwd, force: true });

		expect(existsSync(marker)).toBe(false);
	});
});
