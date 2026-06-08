import { join } from 'node:path';
import process from 'node:process';

import chalk from 'chalk';
import { execa, type ExecaError } from 'execa';
import which from 'which';

import { CommandExitCodes } from '../consts.js';
import { error, run, simpleLog, success } from '../outputs.js';
import { tildify, userHomeDir } from '../utils.js';
import { mergeServerEntry } from './file-config.js';
import { maskSecret, maskToken } from './url.js';

const SERVER_KEY = 'apify';
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface InstallContext {
	url: string;
	token: string;
	yes: boolean;
}

type ClientHandler = (ctx: InstallContext) => Promise<void>;

interface InstallResult {
	clientLabel: string;
	serverUrl: string;
	authDescription: string;
	configPath?: string;
	nextSteps?: string;
}

function printResult(result: InstallResult): void {
	success({ message: `Apify MCP server configured for ${result.clientLabel}.` });

	const lines = [
		'',
		`  ${chalk.yellow('Server URL:')} ${result.serverUrl}`,
		`  ${chalk.yellow('Auth:')}       ${result.authDescription}`,
	];
	if (result.configPath) {
		lines.push(`  ${chalk.yellow('Config:')}     ${tildify(result.configPath)}`);
	}
	if (result.nextSteps) {
		lines.push('', result.nextSteps);
	}

	simpleLog({ message: lines.join('\n') });
}

function isExecaError(err: unknown): err is ExecaError {
	return typeof err === 'object' && err !== null && 'shortMessage' in err && 'command' in err;
}

/** Build a user-facing description of an execa failure, falling back to signal / shortMessage when exitCode is null. */
function describeExecaError(err: unknown, cmd: string): string {
	if (!isExecaError(err)) return err instanceof Error ? err.message : String(err);
	if (err.exitCode != null) return `${cmd} exited with code ${err.exitCode}`;
	if (err.signal) return `${cmd} exited due to signal ${err.signal}`;
	return err.shortMessage ?? err.message;
}

/**
 * Shell out to a client's own CLI to register the server. Child stdout/stderr are captured, not
 * inherited — these CLIs echo the bearer token, so any failure output is scrubbed before display.
 * Returns false (and sets process.exitCode) when the binary is missing or the run fails.
 */
async function runCliInstall({
	binary,
	clientLabel,
	token,
	args,
	maskedCommand,
	missingMessage,
}: {
	binary: string;
	clientLabel: string;
	token: string;
	args: string[];
	maskedCommand: string;
	missingMessage: string;
}): Promise<boolean> {
	if (!(await which(binary, { nothrow: true }))) {
		error({ message: missingMessage });
		process.exitCode = CommandExitCodes.NotFound;
		return false;
	}

	run({ message: maskedCommand });
	try {
		await execa(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
	} catch (err) {
		const childStderr = isExecaError(err) ? String(err.stderr ?? '').trim() : '';
		const reason = childStderr ? `${describeExecaError(err, binary)}\n${childStderr}` : describeExecaError(err, binary);
		error({ message: maskSecret(`Failed to add the MCP server via ${clientLabel}: ${reason}`, token) });
		process.exitCode = CommandExitCodes.RunFailed;
		return false;
	}
	return true;
}

/** Merge an 'apify' entry into a client's JSONC config file at ~/<segments>. */
function fileClient({
	label,
	segments,
	entry,
}: {
	label: string;
	segments: string[];
	entry: (url: string, token: string) => Record<string, unknown>;
}): ClientHandler {
	return async ({ url, token, yes }) => {
		const home = userHomeDir();
		if (!home) {
			error({ message: 'User home directory could not be determined. Set the HOME environment variable and re-run.' });
			process.exitCode = CommandExitCodes.InvalidInput;
			return;
		}
		const filePath = join(home, ...segments);
		const wrote = await mergeServerEntry({
			filePath,
			topLevelKey: 'mcpServers',
			entryKey: SERVER_KEY,
			serverEntry: entry(url, token),
			yes,
		});
		if (!wrote) return;

		printResult({
			clientLabel: label,
			serverUrl: url,
			authDescription: `Bearer ${maskToken(token)}`,
			configPath: filePath,
		});
	};
}

const claudeCodeHandler: ClientHandler = async ({ url, token }) => {
	// Per Anthropic docs, all options must come before the server name. <your-token> placeholder avoids printing the real token.
	const command = (auth: string) =>
		`claude mcp add --transport http --scope user ${SERVER_KEY} "${url}" --header "Authorization: Bearer ${auth}"`;

	const ok = await runCliInstall({
		binary: 'claude',
		clientLabel: 'Claude Code',
		token,
		args: [
			'mcp',
			'add',
			'--transport',
			'http',
			'--scope',
			'user',
			SERVER_KEY,
			url,
			'--header',
			`Authorization: Bearer ${token}`,
		],
		maskedCommand: command(maskToken(token)),
		missingMessage: `The 'claude' CLI was not found on PATH. Install Claude Code (https://docs.anthropic.com/en/docs/claude-code) and re-run, or add the server manually:\n\n    ${command('<your-token>')}`,
	});
	if (!ok) return;

	printResult({
		clientLabel: 'Claude Code',
		serverUrl: url,
		authDescription: `Bearer ${maskToken(token)} (stored by Claude Code)`,
	});
};

/** VS Code (stable + insiders): register via '<bin> --add-mcp <json>'. */
function vscodeHandler(binary: string, clientLabel: string): ClientHandler {
	return async ({ url, token }) => {
		const serverJson = (auth: string) =>
			JSON.stringify({ name: SERVER_KEY, type: 'http', url, headers: { Authorization: auth } });

		const ok = await runCliInstall({
			binary,
			clientLabel,
			token,
			args: ['--add-mcp', serverJson(`Bearer ${token}`)],
			maskedCommand: `${binary} --add-mcp '${serverJson(`Bearer ${maskToken(token)}`)}'`,
			missingMessage: `The '${binary}' CLI was not found on PATH. Install ${clientLabel} and re-run, or add the server manually:\n\n    ${binary} --add-mcp '${serverJson('Bearer <your-token>')}'`,
		});
		if (!ok) return;

		printResult({
			clientLabel,
			serverUrl: url,
			authDescription: `Bearer ${maskToken(token)} (stored by ${clientLabel})`,
		});
	};
}

const codexHandler: ClientHandler = async ({ url }) => {
	const home = userHomeDir();
	if (!home) {
		error({ message: 'User home directory could not be determined. Set the HOME environment variable and re-run.' });
		process.exitCode = CommandExitCodes.InvalidInput;
		return;
	}
	const tomlPath = join(home, '.codex', 'config.toml');
	// codex rejects a literal bearer_token (openai/codex#19275), so auth goes through the APIFY_TOKEN env var.
	const args = ['mcp', 'add', SERVER_KEY, '--url', url, '--bearer-token-env-var', 'APIFY_TOKEN'];
	const tomlSnippet = [`[mcp_servers.${SERVER_KEY}]`, `url = "${url}"`, `bearer_token_env_var = "APIFY_TOKEN"`].join(
		'\n',
	);

	const ok = await runCliInstall({
		binary: 'codex',
		clientLabel: 'Codex CLI',
		token: '',
		args,
		maskedCommand: `codex ${args.join(' ')}`,
		missingMessage: `The 'codex' CLI was not found on PATH. Install Codex (https://developers.openai.com/codex) and re-run, or add this entry manually to ${tildify(tomlPath)}:\n\n${tomlSnippet}\n\nThen, before launching codex, export your Apify token in the same shell:\n\n    export APIFY_TOKEN=<your-token>`,
	});
	if (!ok) return;

	printResult({
		clientLabel: 'Codex CLI',
		serverUrl: url,
		authDescription: `Bearer token from APIFY_TOKEN environment variable`,
		configPath: tomlPath,
		nextSteps: `  ${chalk.yellow('Next:')}      Codex reads APIFY_TOKEN from the environment. Before launching codex, run:\n\n    export APIFY_TOKEN=<your-token>`,
	});
};

const HANDLERS = {
	'claude-code': claudeCodeHandler,
	cursor: fileClient({
		label: 'Cursor',
		segments: ['.cursor', 'mcp.json'],
		entry: (url, token) => ({ url, headers: bearer(token) }),
	}),
	vscode: vscodeHandler('code', 'VS Code'),
	'vscode-insiders': vscodeHandler('code-insiders', 'VS Code Insiders'),
	codex: codexHandler,
	kiro: fileClient({
		label: 'Kiro',
		segments: ['.kiro', 'settings', 'mcp.json'],
		entry: (url, token) => ({ url, headers: bearer(token), disabled: false, autoApprove: [] as string[] }),
	}),
	antigravity: fileClient({
		label: 'Antigravity',
		segments: ['.gemini', 'antigravity', 'mcp_config.json'],
		// Antigravity uses 'serverUrl' (not 'url'); see https://antigravity.google/docs/mcp.
		entry: (url, token) => ({ serverUrl: url, headers: bearer(token) }),
	}),
} satisfies Record<string, ClientHandler>;

export type ClientName = keyof typeof HANDLERS;

export const SUPPORTED_CLIENTS = Object.keys(HANDLERS) as ClientName[];

export function isSupportedClient(value: string): value is ClientName {
	return value in HANDLERS;
}

/** codex authenticates via the APIFY_TOKEN env var the user sets themselves, so the install needs no token. */
const TOKENLESS_CLIENTS = new Set<ClientName>(['codex']);

export function clientNeedsToken(name: ClientName): boolean {
	return !TOKENLESS_CLIENTS.has(name);
}

export function getClientHandler(name: ClientName): ClientHandler {
	return HANDLERS[name];
}
