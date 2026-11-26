import { existsSync } from 'node:fs';
import process from 'node:process';

import ciInfo from 'ci-info';

// Agent-specific signals: the agent is detected when any of these is set to a non-empty value.
const AI_AGENT_ENV_VARS: [string, string][] = [
	['CLAUDECODE', 'claude_code'],
	['CLAUDE_CODE_ENTRYPOINT', 'claude_code'],
	['CLAUDE_CODE', 'claude_code'],
	['CURSOR_AGENT', 'cursor'],
	['CLINE_ACTIVE', 'cline'],
	['CODEX_SANDBOX', 'codex_cli'],
	['CODEX_THREAD_ID', 'codex_cli'],
	['CODEX_CI', 'codex_cli'],
	['CODEX_SANDBOX_NETWORK_DISABLED', 'codex_cli'],
	['CODEX_INTERNAL_ORIGINATOR_OVERRIDE', 'codex_cli'],
	['GEMINI_CLI', 'gemini_cli'],
	['OPENCODE', 'open_code'],
	['OPENCODE_CLIENT', 'open_code'],
	['OPENCLAW_SHELL', 'openclaw'],
	['ANTIGRAVITY_AGENT', 'antigravity'],
	['ANTIGRAVITY_CLI_ALIAS', 'antigravity'],
	['AUGMENT_AGENT', 'augment'],
	['HERMES_AGENT', 'hermes'],
	['GROK_AGENT', 'grok'],
	['GROK_SESSION_ID', 'grok'],
	['KIRO_SESSION_ID', 'kiro'],
	['REPL_ID', 'replit'],
	['COPILOT_MODEL', 'github_copilot'],
	['COPILOT_ALLOW_ALL', 'github_copilot'],
	['COPILOT_GITHUB_TOKEN', 'github_copilot'],
];

// Generic signals carry the agent's name as their value, which is free-form.
const GENERIC_AI_AGENT_ENV_VARS = ['AI_AGENT', 'AGENT'];

const AI_AGENT_NAME_MAX_LENGTH = 64;

export function detectAiAgent(): string | undefined {
	const agent = AI_AGENT_ENV_VARS.find(([envVar]) => process.env[envVar])?.[1];

	if (agent) {
		return agent === 'claude_code' && process.env.CLAUDE_CODE_IS_COWORK ? 'claude_cowork' : agent;
	}

	if (process.env.CURSOR_EXTENSION_HOST_ROLE === 'agent-exec') {
		return 'cursor';
	}

	// Kiro's integrated terminal sets this for humans too; only a non-interactive stdin points to the agent.
	if (process.env.TERM_PROGRAM === 'kiro' && !process.stdin.isTTY) {
		return 'kiro';
	}

	for (const envVar of GENERIC_AI_AGENT_ENV_VARS) {
		const name = process.env[envVar]?.trim();

		if (name) {
			return name.slice(0, AI_AGENT_NAME_MAX_LENGTH);
		}
	}

	if (existsSync('/opt/.devin')) {
		return 'devin';
	}

	return undefined;
}

export function detectCi(): { isCi: boolean; ciProvider: string | undefined } {
	if (!ciInfo.isCI) {
		return { isCi: false, ciProvider: undefined };
	}

	return { isCi: true, ciProvider: ciInfo.id?.toLowerCase() ?? 'unknown' };
}

export function detectIsInteractive(): boolean {
	return !!process.stdin.isTTY && !!process.stdout.isTTY;
}
