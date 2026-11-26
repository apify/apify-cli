import { detectAiAgent, detectCi, detectIsInteractive } from '../../../../src/lib/hooks/telemetry/detectEnvironment.js';

// `ci-info` evaluates process.env at import time,
// so we mock it to control the return value per-test.
vi.mock('ci-info', () => ({ default: { isCI: false, id: null } }));

// Devin is detected by a file on disk, so keep the suite deterministic when it runs inside Devin.
vi.mock('node:fs', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:fs')>()),
	existsSync: () => false,
}));

describe('detectAiAgent', () => {
	const agentEnvVars = [
		'CLAUDECODE',
		'CLAUDE_CODE_ENTRYPOINT',
		'CLAUDE_CODE',
		'CLAUDE_CODE_IS_COWORK',
		'CURSOR_AGENT',
		'CURSOR_EXTENSION_HOST_ROLE',
		'CURSOR_TRACE_ID',
		'CLINE_ACTIVE',
		'CODEX_SANDBOX',
		'CODEX_THREAD_ID',
		'CODEX_CI',
		'CODEX_SANDBOX_NETWORK_DISABLED',
		'CODEX_INTERNAL_ORIGINATOR_OVERRIDE',
		'GEMINI_CLI',
		'OPENCODE',
		'OPENCODE_CLIENT',
		'OPENCLAW_SHELL',
		'ANTIGRAVITY_AGENT',
		'ANTIGRAVITY_CLI_ALIAS',
		'AUGMENT_AGENT',
		'HERMES_AGENT',
		'GROK_AGENT',
		'GROK_SESSION_ID',
		'KIRO_SESSION_ID',
		'TERM_PROGRAM',
		'REPL_ID',
		'COPILOT_MODEL',
		'COPILOT_ALLOW_ALL',
		'COPILOT_GITHUB_TOKEN',
		'AI_AGENT',
		'AGENT',
	];

	beforeEach(() => {
		// The suite itself may run inside one of these agents, so clear the vars before each test
		for (const key of agentEnvVars) {
			vi.stubEnv(key, undefined);
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

	test('detects an agent from a newly added env var', () => {
		vi.stubEnv('CODEX_CI', '1');
		expect(detectAiAgent()).toBe('codex_cli');
	});

	test('prefers an agent-specific env var over the generic AI_AGENT', () => {
		vi.stubEnv('CLAUDECODE', '1');
		vi.stubEnv('AI_AGENT', 'something-else');
		expect(detectAiAgent()).toBe('claude_code');
	});

	test('returns the trimmed AI_AGENT value as the agent name', () => {
		vi.stubEnv('AI_AGENT', '  my-agent  ');
		expect(detectAiAgent()).toBe('my-agent');
	});

	test('does not treat CURSOR_TRACE_ID alone as an agent', () => {
		vi.stubEnv('CURSOR_TRACE_ID', 'abc123');
		expect(detectAiAgent()).toBeUndefined();
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
