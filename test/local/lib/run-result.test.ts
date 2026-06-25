import type { ActorRun, ApifyClient } from 'apify-client';

import {
	buildRunResultJson,
	fetchRunLogTail,
	finalizeRun,
	getRunExitCode,
	printRunResultSummary,
} from '../../../src/lib/commands/run-result.js';

const makeRun = (overrides: Partial<ActorRun> = {}): ActorRun =>
	({
		id: 'run123',
		actId: 'actor456',
		status: 'SUCCEEDED',
		buildNumber: '0.0.1',
		defaultDatasetId: 'dataset789',
		defaultKeyValueStoreId: 'kvs012',
		...overrides,
	}) as ActorRun;

const fakeClientWithLog = (log: string | undefined) =>
	({
		log: () => ({
			get: async () => log,
		}),
	}) as unknown as ApifyClient;

const fakeClientThatThrows = () =>
	({
		log: () => ({
			get: async () => {
				throw new Error('boom');
			},
		}),
	}) as unknown as ApifyClient;

// eslint-disable-next-line no-control-regex
const stripAnsi = (value: string) => value.replace(/\[[0-9;]*m/g, '');

describe('getRunExitCode', () => {
	it('returns 0 for a succeeded run', () => {
		expect(getRunExitCode(makeRun({ status: 'SUCCEEDED' }))).toBe(0);
	});

	it('returns 3 for an aborted run', () => {
		expect(getRunExitCode(makeRun({ status: 'ABORTED' }))).toBe(3);
	});

	it('returns 2 for a timed-out run', () => {
		expect(getRunExitCode(makeRun({ status: 'TIMED-OUT' }))).toBe(2);
	});

	it('propagates the Actor exit code for a failed run', () => {
		expect(getRunExitCode(makeRun({ status: 'FAILED', exitCode: 10 }))).toBe(10);
	});

	it('falls back to 1 for a failed run without an exit code', () => {
		expect(getRunExitCode(makeRun({ status: 'FAILED' }))).toBe(1);
	});
});

describe('buildRunResultJson', () => {
	it('marks a succeeded run as ok with no error', () => {
		const json = buildRunResultJson({ run: makeRun(), operation: 'call', logTail: [] });

		expect(json).toMatchObject({
			ok: true,
			operation: 'call',
			actor: { id: 'actor456', url: 'https://console.apify.com/actors/actor456' },
			run: { id: 'run123', status: 'SUCCEEDED', url: 'https://console.apify.com/actors/actor456/runs/run123' },
			storage: { defaultDatasetId: 'dataset789', defaultKeyValueStoreId: 'kvs012' },
			exitCode: 0,
		});
		expect(json.error).toBeUndefined();
	});

	it('reports a failed run with the error block and log tail', () => {
		const json = buildRunResultJson({
			run: makeRun({ status: 'FAILED', exitCode: 1, statusMessage: 'Actor process exited with code 1' }),
			operation: 'task-run',
			logTail: ['last log line'],
		});

		expect(json.ok).toBe(false);
		expect(json.operation).toBe('task-run');
		expect(json.run.status).toBe('FAILED');
		expect(json.exitCode).toBe(1);
		expect(json.error).toEqual({
			phase: 'run',
			message: 'Actor process exited with code 1',
			logTail: ['last log line'],
		});
	});
});

describe('fetchRunLogTail', () => {
	it('returns an empty array for a succeeded run without fetching', async () => {
		const tail = await fetchRunLogTail(fakeClientThatThrows(), makeRun({ status: 'SUCCEEDED' }));
		expect(tail).toEqual([]);
	});

	it('returns the last lines for a failed run', async () => {
		const log = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`).join('\n');
		const tail = await fetchRunLogTail(fakeClientWithLog(log), makeRun({ status: 'FAILED' }));

		expect(tail).toHaveLength(10);
		expect(tail[0]).toBe('line 6');
		expect(tail.at(-1)).toBe('line 15');
	});

	it('returns an empty array when the log cannot be fetched', async () => {
		const tail = await fetchRunLogTail(fakeClientThatThrows(), makeRun({ status: 'FAILED' }));
		expect(tail).toEqual([]);
	});
});

describe('printRunResultSummary', () => {
	it('prints a failed summary including exit code and reason', () => {
		const lines: string[] = [];
		const spy = vi.spyOn(console, 'log').mockImplementation((msg) => lines.push(String(msg)));

		printRunResultSummary({
			run: makeRun({ status: 'FAILED', exitCode: 1, statusMessage: 'Actor process exited with code 1' }),
			operation: 'call',
			logTail: ['some failing log'],
		});

		spy.mockRestore();

		const output = stripAnsi(lines.join('\n'));
		expect(output).toContain('Apify call result: FAILED');
		expect(output).toContain('Exit code: 1');
		expect(output).toContain('Reason:');
		expect(output).toContain('Actor process exited with code 1');
		expect(output).toContain('some failing log');
	});

	it('omits the exit code and reason for a succeeded run', () => {
		const lines: string[] = [];
		const spy = vi.spyOn(console, 'log').mockImplementation((msg) => lines.push(String(msg)));

		printRunResultSummary({ run: makeRun(), operation: 'call', logTail: [] });

		spy.mockRestore();

		const output = stripAnsi(lines.join('\n'));
		expect(output).toContain('Apify call result: SUCCEEDED');
		expect(output).not.toContain('Exit code:');
		expect(output).not.toContain('Reason:');
	});
});

describe('finalizeRun', () => {
	const originalExitCode = process.exitCode;

	afterEach(() => {
		process.exitCode = originalExitCode;
	});

	it('sets the exit code and prints the JSON payload in JSON mode', async () => {
		const lines: string[] = [];
		const spy = vi.spyOn(console, 'log').mockImplementation((msg) => lines.push(String(msg)));

		await finalizeRun({
			apifyClient: fakeClientWithLog(undefined),
			run: makeRun({ status: 'FAILED', exitCode: 1 }),
			operation: 'call',
			json: true,
		});

		spy.mockRestore();

		expect(process.exitCode).toBe(1);
		const parsed = JSON.parse(lines.join('\n'));
		expect(parsed).toMatchObject({ ok: false, operation: 'call', run: { status: 'FAILED' }, exitCode: 1 });
	});

	it('prints nothing but still sets the exit code in silent mode', async () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

		await finalizeRun({
			apifyClient: fakeClientWithLog(undefined),
			run: makeRun({ status: 'ABORTED' }),
			operation: 'call',
			json: false,
			silent: true,
		});

		spy.mockRestore();

		expect(process.exitCode).toBe(3);
		expect(spy).not.toHaveBeenCalled();
	});
});
