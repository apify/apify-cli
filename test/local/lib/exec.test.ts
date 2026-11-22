import process from 'node:process';

import { execWithLog, keepStdoutClean } from '../../../src/lib/exec.js';

describe('keepStdoutClean', () => {
	const originalNoLogs = process.env.APIFY_NO_LOGS_IN_TESTS;

	beforeEach(() => {
		// The redirect is skipped entirely when this is set, so it has to be off for this test.
		delete process.env.APIFY_NO_LOGS_IN_TESTS;
	});

	afterEach(() => {
		if (originalNoLogs === undefined) delete process.env.APIFY_NO_LOGS_IN_TESTS;
		else process.env.APIFY_NO_LOGS_IN_TESTS = originalNoLogs;
	});

	it('routes child process stdout to stderr', async () => {
		const stdoutChunks: string[] = [];
		const stderrChunks: string[] = [];

		vitest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
			stdoutChunks.push(String(chunk));
			return true;
		});
		vitest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
			stderrChunks.push(String(chunk));
			return true;
		});

		keepStdoutClean();
		await execWithLog({ cmd: process.execPath, args: ['-e', "console.log('marker-from-child')"] });

		expect(stderrChunks.join('')).toContain('marker-from-child');
		expect(stdoutChunks.join('')).not.toContain('marker-from-child');
	});
});

describe('execWithLog debug output', () => {
	afterEach(() => {
		vitest.unstubAllEnvs();
		vitest.restoreAllMocks();
	});

	it('logs the names of the env vars, never their values', async () => {
		vitest.stubEnv('APIFY_CLI_DEBUG', '1');
		const output: string[] = [];
		vitest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
			output.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
		});
		vitest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
			output.push(String(chunk));
			return true;
		});

		await execWithLog({
			cmd: process.execPath,
			args: ['-e', ''],
			opts: { env: { ...process.env, DEBUG_SENTINEL_NAME: 's3cr3t-sentinel' } },
		});

		expect(output.join('\n')).toContain('DEBUG_SENTINEL_NAME');
		expect(output.join('\n')).not.toContain('s3cr3t-sentinel');
	});
});
