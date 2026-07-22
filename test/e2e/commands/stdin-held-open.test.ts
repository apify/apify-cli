import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';

import { TestTmpRoot } from '../__helpers__/tmp.js';

const DistApify = fileURLToPath(new URL('../../../dist/apify.js', import.meta.url));

// How long the CLI gets to exit on its own. The command itself finishes in well
// under a second; the broken behavior never exits at all, so any finite deadline
// separates the two. Generous to absorb slow CI runners.
const EXIT_DEADLINE_MS = 15_000;

describe('[e2e] stdin held open (#1206)', () => {
	const emptyDir = path.join(TestTmpRoot, 'stdin-held-open');

	beforeAll(async () => {
		await rm(emptyDir, { recursive: true, force: true });
		await mkdir(emptyDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(emptyDir, { recursive: true, force: true });
	});

	it('exits on its own when stdin is a pipe that never closes', async () => {
		// The runCli helper cannot express this scenario: it either ignores stdin or
		// writes input and closes it. execa with stdin: 'pipe' and no `input` keeps
		// the child's stdin open for the child's whole lifetime (verified on execa 9),
		// which is what spawned subprocesses (CI runners, agent shells) see. Before
		// the fix, the startup stdin read left process.stdin flowing with a data
		// listener attached, so the CLI printed all its output but never exited.
		const result = await execa('node', [DistApify, 'run'], {
			cwd: emptyDir,
			reject: false,
			timeout: EXIT_DEADLINE_MS,
			stdin: 'pipe',
			env: {
				APIFY_CLI_DISABLE_TELEMETRY: '1',
				APIFY_CLI_SKIP_UPDATE_CHECK: '1',
				APIFY_DISABLE_KEYRING: '1',
			},
		});

		// `timedOut` is the regression signal: the broken build completes the command
		// (same stderr) but never exits, so execa kills it at the deadline.
		expect(result.timedOut, `stderr: ${result.stderr}`).toBe(false);

		// Sanity: the command really ran and failed naturally (an empty dir is not an
		// actor project). Keep this on `apify run`: --version, --help, and unknown
		// commands all call process.exit(), which exits even with a leaked stdin
		// handle and would mask the regression.
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain('Actor is of an unknown format');
	});
});
