import { randomBytes } from 'node:crypto';
import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from './__helpers__/run-cli.js';

const TestTmpRoot = fileURLToPath(new URL('../../tmp/', import.meta.url));

describe('[e2e] apify create', () => {
	let tmpDir: string;
	const createdDirs: string[] = [];

	beforeAll(async () => {
		const dirName = `e2e-create-${randomBytes(6).toString('hex')}`;
		tmpDir = path.join(TestTmpRoot, dirName);
		await mkdir(tmpDir, { recursive: true });
	});

	afterAll(async () => {
		for (const dir of createdDirs) {
			await rm(dir, { recursive: true, force: true });
		}
		await rm(tmpDir, { recursive: true, force: true });
	});

	it('creates an actor project with --template project_empty --skip-dependency-install', async () => {
		const actorName = `test-actor-${randomBytes(4).toString('hex')}`;
		const actorDir = path.join(tmpDir, actorName);
		createdDirs.push(actorDir);

		const result = await runCli('apify', ['create', actorName, '--template', 'project_empty', '--skip-dependency-install'], {
			cwd: tmpDir,
		});

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stderr).toContain('created successfully');

		// Verify directory structure
		await expect(access(actorDir)).resolves.toBeUndefined();
		await expect(access(path.join(actorDir, '.actor', 'actor.json'))).resolves.toBeUndefined();
		await expect(access(path.join(actorDir, 'src'))).resolves.toBeUndefined();
	});

	it('fails when creating in a directory that already exists with content', async () => {
		const actorName = `test-actor-${randomBytes(4).toString('hex')}`;
		const actorDir = path.join(tmpDir, actorName);
		createdDirs.push(actorDir);

		// First create succeeds
		const first = await runCli('apify', ['create', actorName, '--template', 'project_empty', '--skip-dependency-install'], {
			cwd: tmpDir,
		});
		expect(first.exitCode, `stderr: ${first.stderr}`).toBe(0);

		// Second create in same dir should fail
		const second = await runCli('apify', ['create', actorName, '--template', 'project_empty', '--skip-dependency-install'], {
			cwd: tmpDir,
		});
		expect(second.exitCode).not.toBe(0);
	});
});
