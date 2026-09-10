import { detectAiAgent, detectCi, detectIsInteractive } from '../../../../src/lib/hooks/telemetry/detectEnvironment.js';

// `ci-info` evaluates process.env at import time,
// so we mock it to control the return value per-test.
vi.mock('ci-info', () => ({ default: { isCI: false, id: null } }));

describe('detectAiAgent', () => {
	const agentEnvVars = [
		'CLAUDECODE',
		'CLAUDE_CODE_ENTRYPOINT',
		'CURSOR_AGENT',
		'CLINE_ACTIVE',
		'CODEX_SANDBOX',
		'CODEX_THREAD_ID',
		'GEMINI_CLI',
		'OPENCODE',
		'OPENCLAW_SHELL',
	];

	// The suite may run inside an AI coding tool, which sets some of these,
	// so clear them all instead of relying on the ambient environment.
	beforeEach(() => {
		for (const key of agentEnvVars) {
			vi.stubEnv(key, '');
		}
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test('returns undefined when no agent env vars are set', () => {
		expect(detectAiAgent()).toBeUndefined();
	});

	test('returns correct agent for a known env var', () => {
		vi.stubEnv('GEMINI_CLI', '1');
		expect(detectAiAgent()).toBe('gemini_cli');
	});

	test('returns first match when multiple agent env vars are set', () => {
		vi.stubEnv('CURSOR_AGENT', '1');
		vi.stubEnv('GEMINI_CLI', '1');

		// CURSOR_AGENT appears before GEMINI_CLI in the lookup table
		expect(detectAiAgent()).toBe('cursor');
	});
});

describe('detectCi', () => {
	test('returns isCi false when not in CI', () => {
		const result = detectCi();
		expect(result).toEqual({ isCi: false, ciProvider: undefined });
	});

	test('returns provider id from ci-info when in CI', async () => {
		vi.resetModules();
		vi.doMock('ci-info', () => ({ default: { isCI: true, id: 'GITHUB_ACTIONS' } }));

		const { detectCi: detectCiFresh } = await import('../../../../src/lib/hooks/telemetry/detectEnvironment.js');

		expect(detectCiFresh()).toEqual({ isCi: true, ciProvider: 'github_actions' });
	});

	test('returns unknown provider when in CI but ci-info has no id', async () => {
		vi.resetModules();
		vi.doMock('ci-info', () => ({ default: { isCI: true, id: null } }));

		const { detectCi: detectCiFresh } = await import('../../../../src/lib/hooks/telemetry/detectEnvironment.js');

		expect(detectCiFresh()).toEqual({ isCi: true, ciProvider: 'unknown' });
	});
});

describe('detectIsInteractive', () => {
	test('returns false when stdin or stdout is not a TTY', () => {
		// In test runners, stdio is typically not a TTY
		expect(detectIsInteractive()).toBe(false);
	});
});
