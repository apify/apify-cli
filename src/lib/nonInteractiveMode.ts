import process from 'node:process';

export const NON_INTERACTIVE_FLAG_NAME = 'non-interactive';
export const NON_INTERACTIVE_ENV_VAR = 'APIFY_CLI_NON_INTERACTIVE';

// Kept here (not detectEnvironment.ts) to avoid a circular import — detectEnvironment.ts already imports from this module.
export const AGENT_ENV_VARS: readonly [string, string][] = [
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

let _flagSet = false;

export function isNonInteractive(): boolean {
	return (
		_flagSet || process.env[NON_INTERACTIVE_ENV_VAR] === '1' || AGENT_ENV_VARS.some(([envVar]) => !!process.env[envVar])
	);
}

export function setNonInteractiveFlag(value: boolean): void {
	_flagSet = value;
}

export function resetNonInteractiveFlag(): void {
	_flagSet = false;
}
