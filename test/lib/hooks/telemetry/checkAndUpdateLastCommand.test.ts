import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

let telemetryFilePath: string;

vi.mock('../../../../src/lib/consts.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../../../src/lib/consts.js')>();

	return {
		...original,
		TELEMETRY_FILE_PATH: () => telemetryFilePath,
	};
});

vi.mock('../../../../src/lib/utils.js', () => ({
	getLocalUserInfo: async () => ({}),
}));

vi.mock('../../../../src/lib/outputs.js', () => ({
	info: () => {
		/* noop */
	},
}));

function writeTelemetryState(state: Record<string, unknown>) {
	const dir = dirname(telemetryFilePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(telemetryFilePath, JSON.stringify(state, null, '\t'));
}

function readTelemetryState() {
	return JSON.parse(readFileSync(telemetryFilePath, 'utf-8'));
}

describe('checkAndUpdateLastCommand', () => {
	let testDir: string;
	let counter = 0;

	beforeEach(() => {
		counter++;
		testDir = join(tmpdir(), `apify-cli-test-telemetry-${process.pid}-${counter}-${Date.now()}`);
		telemetryFilePath = join(testDir, 'telemetry.json');
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		// Clean up temp files
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('returns false on first invocation (no prior command)', async () => {
		vi.setSystemTime(1000);

		const { checkAndUpdateLastCommand } = await import('../../../../src/lib/hooks/telemetry/useTelemetryState.js');

		const result = await checkAndUpdateLastCommand('apify run');

		expect(result).toBe(false);
	});

	test('stores the command and timestamp in telemetry state', async () => {
		vi.setSystemTime(50_000);

		const { checkAndUpdateLastCommand } = await import('../../../../src/lib/hooks/telemetry/useTelemetryState.js');

		await checkAndUpdateLastCommand('apify push');

		const state = readTelemetryState();
		expect(state.lastCommand).toBe('apify push');
		expect(state.lastCommandTimestamp).toBe(50_000);
	});

	test('returns true when the same command is repeated within the retry window', async () => {
		vi.setSystemTime(100_000);

		// Seed state with a recent identical command
		writeTelemetryState({
			version: 1,
			enabled: true,
			anonymousId: 'CLI:test',
			lastCommand: 'apify run',
			lastCommandTimestamp: 95_000, // 5 seconds ago — within the 10s window
		});

		const { checkAndUpdateLastCommand } = await import('../../../../src/lib/hooks/telemetry/useTelemetryState.js');

		const result = await checkAndUpdateLastCommand('apify run');

		expect(result).toBe(true);
	});

	test('returns false when the same command is repeated outside the retry window', async () => {
		vi.setSystemTime(100_000);

		writeTelemetryState({
			version: 1,
			enabled: true,
			anonymousId: 'CLI:test',
			lastCommand: 'apify run',
			lastCommandTimestamp: 80_000, // 20 seconds ago — outside the 10s window
		});

		const { checkAndUpdateLastCommand } = await import('../../../../src/lib/hooks/telemetry/useTelemetryState.js');

		const result = await checkAndUpdateLastCommand('apify run');

		expect(result).toBe(false);
	});

	test('returns false when a different command is run within the retry window', async () => {
		vi.setSystemTime(100_000);

		writeTelemetryState({
			version: 1,
			enabled: true,
			anonymousId: 'CLI:test',
			lastCommand: 'apify run',
			lastCommandTimestamp: 95_000,
		});

		const { checkAndUpdateLastCommand } = await import('../../../../src/lib/hooks/telemetry/useTelemetryState.js');

		const result = await checkAndUpdateLastCommand('apify push');

		expect(result).toBe(false);
	});

	test('updates state after checking so the next call sees the new command', async () => {
		vi.setSystemTime(100_000);

		writeTelemetryState({
			version: 1,
			enabled: true,
			anonymousId: 'CLI:test',
			lastCommand: 'apify run',
			lastCommandTimestamp: 90_000,
		});

		const { checkAndUpdateLastCommand } = await import('../../../../src/lib/hooks/telemetry/useTelemetryState.js');

		await checkAndUpdateLastCommand('apify push');

		const state = readTelemetryState();
		expect(state.lastCommand).toBe('apify push');
		expect(state.lastCommandTimestamp).toBe(100_000);
	});

	test('returns false when lastCommandTimestamp is missing', async () => {
		vi.setSystemTime(100_000);

		writeTelemetryState({
			version: 1,
			enabled: true,
			anonymousId: 'CLI:test',
			lastCommand: 'apify run',
			// no lastCommandTimestamp
		});

		const { checkAndUpdateLastCommand } = await import('../../../../src/lib/hooks/telemetry/useTelemetryState.js');

		const result = await checkAndUpdateLastCommand('apify run');

		expect(result).toBe(false);
	});

	test('returns false when telemetry state file is corrupted', async () => {
		// Write invalid JSON
		const dir = dirname(telemetryFilePath);
		mkdirSync(dir, { recursive: true });
		writeFileSync(telemetryFilePath, '{{{invalid json');

		const { checkAndUpdateLastCommand } = await import('../../../../src/lib/hooks/telemetry/useTelemetryState.js');

		const result = await checkAndUpdateLastCommand('apify run');

		expect(result).toBe(false);
	});

	test('returns true at exactly the retry window boundary', async () => {
		// Command was run exactly 9999ms ago (just inside the 10_000ms window)
		vi.setSystemTime(109_999);

		writeTelemetryState({
			version: 1,
			enabled: true,
			anonymousId: 'CLI:test',
			lastCommand: 'apify run',
			lastCommandTimestamp: 100_000,
		});

		const { checkAndUpdateLastCommand } = await import('../../../../src/lib/hooks/telemetry/useTelemetryState.js');

		const result = await checkAndUpdateLastCommand('apify run');

		expect(result).toBe(true);
	});

	test('returns false at exactly the retry window boundary (equal to window)', async () => {
		// Command was run exactly 10_000ms ago (at the boundary, not strictly less than)
		vi.setSystemTime(110_000);

		writeTelemetryState({
			version: 1,
			enabled: true,
			anonymousId: 'CLI:test',
			lastCommand: 'apify run',
			lastCommandTimestamp: 100_000,
		});

		const { checkAndUpdateLastCommand } = await import('../../../../src/lib/hooks/telemetry/useTelemetryState.js');

		const result = await checkAndUpdateLastCommand('apify run');

		expect(result).toBe(false);
	});
});
