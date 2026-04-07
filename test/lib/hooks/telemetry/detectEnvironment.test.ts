import { detectAiAgent, detectCi, detectIsInteractive } from '../../../../src/lib/hooks/telemetry/detectEnvironment.js';

// `is-ci` (and its underlying `ci-info`) evaluates process.env at import time,
// so we mock it to control the return value per-test.
vi.mock('is-ci', () => ({ default: false }));

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

	afterEach(() => {
		for (const key of agentEnvVars) {
			delete process.env[key];
		}
	});

	test('returns undefined when no agent env vars are set', () => {
		expect(detectAiAgent()).toBeUndefined();
	});

	test('returns correct agent for a known env var', () => {
		process.env.GEMINI_CLI = '1';
		expect(detectAiAgent()).toBe('gemini_cli');
	});

	test('returns first match when multiple agent env vars are set', () => {
		process.env.CURSOR_AGENT = '1';
		process.env.GEMINI_CLI = '1';

		// CURSOR_AGENT appears before GEMINI_CLI in the lookup table
		expect(detectAiAgent()).toBe('cursor');
	});
});

describe('detectCi', () => {
	const ciProviderEnvVars = ['GITHUB_ACTIONS', 'GITLAB_CI', 'JENKINS_URL', 'CIRCLECI', 'BUILDKITE', 'TRAVIS'];

	afterEach(() => {
		for (const key of ciProviderEnvVars) {
			delete process.env[key];
		}
	});

	test('returns isCi false when not in CI', () => {
		const result = detectCi();
		expect(result).toEqual({ isCi: false, ciProvider: undefined });
	});

	test('returns known provider when in CI with recognized env var', async () => {
		vi.resetModules();
		vi.doMock('is-ci', () => ({ default: true }));

		const { detectCi: detectCiFresh } = await import(
			'../../../../src/lib/hooks/telemetry/detectEnvironment.js'
		);

		process.env.GITHUB_ACTIONS = 'true';
		expect(detectCiFresh()).toEqual({ isCi: true, ciProvider: 'github_actions' });
	});

	test('returns unknown provider when in CI but no recognized provider env var', async () => {
		vi.resetModules();
		vi.doMock('is-ci', () => ({ default: true }));

		const { detectCi: detectCiFresh } = await import(
			'../../../../src/lib/hooks/telemetry/detectEnvironment.js'
		);

		expect(detectCiFresh()).toEqual({ isCi: true, ciProvider: 'unknown' });
	});
});

describe('detectIsInteractive', () => {
	test('returns false when stdin or stdout is not a TTY', () => {
		// In test runners, stdio is typically not a TTY
		expect(detectIsInteractive()).toBe(false);
	});
});
