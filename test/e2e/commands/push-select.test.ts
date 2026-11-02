import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runCli } from '../__helpers__/run-cli.js';
import { TestTmpRoot } from '../__helpers__/tmp.js';

describe('[e2e] apify push in a repository with several Actors', () => {
	const root = path.join(TestTmpRoot, `push-select-${randomBytes(6).toString('hex')}`);

	async function writeActor(dir: string, name: string) {
		await mkdir(path.join(root, dir, '.actor'), { recursive: true });
		await writeFile(path.join(root, dir, '.actor', 'actor.json'), JSON.stringify({ actorSpecification: 1, name }));
		await writeFile(path.join(root, dir, 'main.js'), `console.log("${name}")`);
	}

	beforeAll(async () => {
		await writeActor('actors/first', 'first-actor');
		await writeActor('actors/second', 'second-actor');
		await mkdir(path.join(root, 'packages', 'shared'), { recursive: true });
		await writeFile(path.join(root, 'packages', 'shared', 'index.js'), 'module.exports = {};');
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it('lists the Actors below the root and exits with code 4 without a token', async () => {
		const result = await runCli('apify', ['push'], { cwd: root });

		expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(4);
		expect(result.stderr).toContain('actors/first (first-actor)');
		expect(result.stderr).toContain('actors/second (second-actor)');
		expect(result.stderr).toContain('Choose what to push: --all, or run apify push --dir <path> for each Actor.');
		expect(result.stderr).not.toContain('login');
		expect(result.stdout).toBe('');
	});

	it('lists the paths to pass to --dir from where the command ran', async () => {
		const result = await runCli('apify', ['push', '--dir', 'actors', '--json'], { cwd: root });

		expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(4);
		expect(result.stderr).toContain('  actors/first (first-actor)');
		expect(result.stderr).toContain('  actors/second (second-actor)');
		expect(result.stderr).not.toContain('login');
		expect(result.stdout).toBe('');
	});
});
