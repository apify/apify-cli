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
		await execWithLog({ cmd: 'echo', args: ['marker-from-child'] });

		expect(stderrChunks.join('')).toContain('marker-from-child');
		expect(stdoutChunks.join('')).not.toContain('marker-from-child');
	});
});
