import { randomBytes } from 'node:crypto';
import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { runCli } from '../__helpers__/run-cli.js';
import { TestTmpRoot } from '../__helpers__/tmp.js';

describe('[e2e] apify init', () => {
	let tmpDir: string;

	beforeAll(async () => {
		const dirName = `e2e-init-${randomBytes(6).toString('hex')}`;
		tmpDir = path.join(TestTmpRoot, dirName);
		await mkdir(tmpDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it('initializes an actor project in an empty directory with --yes', async () => {
		const result = await runCli('apify', ['init', 'my-test-actor', '--yes'], { cwd: tmpDir });

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stderr).toContain('The Actor has been initialized in the current directory.');

		// Verify .actor/actor.json exists
		await expect(access(path.join(tmpDir, '.actor', 'actor.json'))).resolves.toBeUndefined();
	});
});
