import isCI from 'is-ci';

const AI_AGENT_ENV_VARS: [string, string][] = [
	['CLAUDECODE', 'claude_code'],
	['CLAUDE_CODE_ENTRYPOINT', 'claude_code'],
	['CURSOR_AGENT', 'cursor'],
	['CLINE_ACTIVE', 'cline'],
	['CODEX_SANDBOX', 'codex_cli'],
	['CODEX_THREAD_ID', 'codex_cli'],
	['GEMINI_CLI', 'gemini_cli'],
	['OPENCODE', 'open_code'],
	['OPENCLAW_SHELL', 'openclaw'],
];

const CI_PROVIDER_ENV_VARS: [string, string][] = [
	['GITHUB_ACTIONS', 'github_actions'],
	['GITLAB_CI', 'gitlab'],
	['JENKINS_URL', 'jenkins'],
	['CIRCLECI', 'circle'],
	['BUILDKITE', 'buildkite'],
	['TRAVIS', 'travis'],
];

export function detectAiAgent(): string | undefined {
	for (const [envVar, agent] of AI_AGENT_ENV_VARS) {
		if (process.env[envVar]) {
			return agent;
		}
	}

	return undefined;
}

export function detectCi(): { isCi: boolean; ciProvider: string | undefined } {
	if (!isCI) {
		return { isCi: false, ciProvider: undefined };
	}

	for (const [envVar, provider] of CI_PROVIDER_ENV_VARS) {
		if (process.env[envVar]) {
			return { isCi: true, ciProvider: provider };
		}
	}

	return { isCi: true, ciProvider: 'unknown' };
}

export function detectIsInteractive(): boolean {
	return !!process.stdin.isTTY && !!process.stdout.isTTY;
}
