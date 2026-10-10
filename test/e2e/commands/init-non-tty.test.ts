import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runCliBounded } from '../__helpers__/run-cli-bounded.js';
import { TestTmpRoot } from '../__helpers__/tmp.js';

const MissingNameError = 'Error: Actor name is required';

function countOccurrences(haystack: string, needle: string) {
	return haystack.split(needle).length - 1;
}

async function makeNodeProject(dir: string) {
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'p', version: '1.0.0', main: 'index.js' }));
	await writeFile(path.join(dir, 'index.js'), 'console.log(1);\n');
}

describe('[e2e] apify init with no usable stdin', () => {
	let root: string;

	beforeAll(async () => {
		root = path.join(TestTmpRoot, `e2e-init-non-tty-${randomBytes(6).toString('hex')}`);
		await mkdir(root, { recursive: true });
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it('--yes with no name initializes with the directory name', async () => {
		const cwd = path.join(root, 'yes-default-name');
		await makeNodeProject(cwd);

		const result = await runCliBounded('apify', ['init', '--yes'], { cwd });

		expect(result.outputCapExceeded, `the prompt retried instead of failing once (${result.bytesWritten} bytes)`).toBe(
			false,
		);
		expect(result.timedOut, `stderr: ${result.stderr}`).toBe(false);
		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stderr).toContain('The Actor has been initialized in the current directory.');

		const config = JSON.parse(await readFile(path.join(cwd, '.actor', 'actor.json'), 'utf8'));
		expect(config.name).toBe('yes-default-name');
	});

	it('without --yes fails once instead of retrying the name prompt', async () => {
		const cwd = path.join(root, 'no-yes-missing-name');
		await makeNodeProject(cwd);

		const result = await runCliBounded('apify', ['init'], { cwd });

		expect(result.outputCapExceeded, `the prompt retried instead of failing once (${result.bytesWritten} bytes)`).toBe(
			false,
		);
		expect(result.timedOut, `stderr: ${result.stderr}`).toBe(false);
		expect(result.exitCode).not.toBe(0);
		expect(countOccurrences(result.stderr, MissingNameError)).toBe(1);
		expect(result.stderr).toContain('apify init <name>');
		expect(result.stderr).toContain('--yes');

		await expect(access(path.join(cwd, '.actor', 'actor.json'))).rejects.toThrow();
	});

	it('without --yes fails in a directory that is not a Node.js or Python project', async () => {
		const cwd = path.join(root, 'no-yes-unknown-project');
		await mkdir(cwd, { recursive: true });

		const result = await runCliBounded('apify', ['init'], { cwd });

		expect(result.outputCapExceeded, `the prompt retried instead of failing once (${result.bytesWritten} bytes)`).toBe(
			false,
		);
		expect(result.timedOut, `stderr: ${result.stderr}`).toBe(false);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain('Confirmation is required to continue');

		await expect(access(path.join(cwd, '.actor', 'actor.json'))).rejects.toThrow();
	});
});
