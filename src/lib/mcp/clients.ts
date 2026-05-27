import { join } from 'node:path';
import process from 'node:process';

import chalk from 'chalk';
import { execa } from 'execa';
import which from 'which';

import { CommandExitCodes } from '../consts.js';
import { error, run, simpleLog, success } from '../outputs.js';
import { tildify, userHomeDir } from '../utils.js';
import { describeExecaError } from './exec-helpers.js';
import { mergeServerEntry } from './file-config.js';
import { maskToken } from './url.js';

export const SUPPORTED_CLIENTS = [
	'claude-code',
	'cursor',
	'vscode',
	'vscode-insiders',
	'codex',
	'kiro',
	'antigravity',
] as const;

export type ClientName = (typeof SUPPORTED_CLIENTS)[number];

export function isSupportedClient(value: string): value is ClientName {
	return (SUPPORTED_CLIENTS as readonly string[]).includes(value);
}

export interface InstallContext {
	url: string;
	token: string;
	yes: boolean;
}

type ClientHandler = (ctx: InstallContext) => Promise<void>;

const SERVER_KEY = 'apify';

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

const claudeCodeHandler: ClientHandler = async ({ url, token }) => {
	const claudeBin = await which('claude', { nothrow: true });

	if (!claudeBin) {
		// --scope user matches the other clients' user-wide config locations; <your-token> placeholder avoids printing the real token.
		const manualCommand = `claude mcp add --transport http --scope user ${SERVER_KEY} "${url}" --header "Authorization: Bearer <your-token>"`;
		error({
			message: `The 'claude' CLI was not found on PATH. Install Claude Code (https://docs.anthropic.com/en/docs/claude-code) and re-run, or add the server manually:\n\n    ${manualCommand}`,
		});
		process.exitCode = CommandExitCodes.NotFound;
		return;
	}

	// Raw execa (no shell:true) — execWithLog joins args into a shell string, which breaks values with spaces (e.g. 'Authorization: Bearer …').
	// Per Anthropic docs, all options must come before the server name.
	const args = [
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
	];
	run({
		message: `claude mcp add --transport http --scope user ${SERVER_KEY} "${url}" --header "Authorization: Bearer ${maskToken(token)}"`,
	});

	try {
		// Discard child stdout — 'claude mcp add' echoes the Authorization header on success. stderr stays inherited for live error output.
		await execa('claude', args, { stdio: ['ignore', 'ignore', 'inherit'] });
	} catch (err) {
		error({ message: `Failed to add the MCP server via Claude Code: ${describeExecaError(err, 'claude')}` });
		process.exitCode = CommandExitCodes.RunFailed;
		return;
	}

	printResult({
		clientLabel: 'Claude Code',
		serverUrl: url,
		authDescription: `Bearer ${maskToken(token)} (stored by Claude Code)`,
	});
};

const cursorHandler: ClientHandler = async ({ url, token, yes }) => {
	const filePath = join(userHomeDir(), '.cursor', 'mcp.json');
	const serverEntry = { url, headers: { Authorization: `Bearer ${token}` } };

	const wrote = await mergeServerEntry({ filePath, topLevelKey: 'mcpServers', entryKey: SERVER_KEY, serverEntry, yes });
	if (!wrote) return;

	printResult({
		clientLabel: 'Cursor',
		serverUrl: url,
		authDescription: `Bearer ${maskToken(token)}`,
		configPath: filePath,
	});
};

/**
 * Install via the client's own '--add-mcp <json>' CLI. The client owns the config format,
 * comments, and overwrite semantics — we just shell out and let it handle the rest.
 */
async function addMcpViaCli({
	binary,
	clientLabel,
	url,
	token,
}: {
	binary: string;
	clientLabel: string;
	url: string;
	token: string;
}): Promise<void> {
	const bin = await which(binary, { nothrow: true });

	if (!bin) {
		const placeholderJson = JSON.stringify({
			name: SERVER_KEY,
			type: 'http',
			url,
			headers: { Authorization: 'Bearer <your-token>' },
		});
		error({
			message: `The '${binary}' CLI was not found on PATH. Install ${clientLabel} and re-run, or add the server manually:\n\n    ${binary} --add-mcp '${placeholderJson}'`,
		});
		process.exitCode = CommandExitCodes.NotFound;
		return;
	}

	const serverJson = JSON.stringify({
		name: SERVER_KEY,
		type: 'http',
		url,
		headers: { Authorization: `Bearer ${token}` },
	});
	const maskedJson = JSON.stringify({
		name: SERVER_KEY,
		type: 'http',
		url,
		headers: { Authorization: `Bearer ${maskToken(token)}` },
	});

	run({ message: `${binary} --add-mcp '${maskedJson}'` });

	try {
		await execa(binary, ['--add-mcp', serverJson], { stdio: ['ignore', 'ignore', 'inherit'] });
	} catch (err) {
		error({ message: `Failed to add the MCP server via ${clientLabel}: ${describeExecaError(err, binary)}` });
		process.exitCode = CommandExitCodes.RunFailed;
		return;
	}

	printResult({
		clientLabel,
		serverUrl: url,
		authDescription: `Bearer ${maskToken(token)} (stored by ${clientLabel})`,
	});
}

const vscodeHandler: ClientHandler = async ({ url, token }) =>
	addMcpViaCli({ binary: 'code', clientLabel: 'VS Code', url, token });

const vscodeInsidersHandler: ClientHandler = async ({ url, token }) =>
	addMcpViaCli({ binary: 'code-insiders', clientLabel: 'VS Code Insiders', url, token });

const codexHandler: ClientHandler = async ({ url }) => {
	const codexBin = await which('codex', { nothrow: true });
	const tomlPath = join(userHomeDir(), '.codex', 'config.toml');

	if (!codexBin) {
		const tomlSnippet = [`[mcp_servers.${SERVER_KEY}]`, `url = "${url}"`, `bearer_token_env_var = "APIFY_TOKEN"`].join(
			'\n',
		);
		error({
			message: `The 'codex' CLI was not found on PATH. Install Codex (https://developers.openai.com/codex) and re-run, or add this entry manually to ${tildify(tomlPath)}:\n\n${tomlSnippet}\n\nThen, before launching codex, export your Apify token in the same shell:\n\n    export APIFY_TOKEN=<your-token>`,
		});
		process.exitCode = CommandExitCodes.NotFound;
		return;
	}

	const args = ['mcp', 'add', SERVER_KEY, '--url', url, '--bearer-token-env-var', 'APIFY_TOKEN'];
	run({ message: `codex ${args.join(' ')}` });

	try {
		// Discard child stdout — codex echoes the configured entry on success. stderr stays inherited for live error output.
		await execa('codex', args, { stdio: ['ignore', 'ignore', 'inherit'] });
	} catch (err) {
		error({ message: `Failed to add the MCP server via Codex: ${describeExecaError(err, 'codex')}` });
		process.exitCode = CommandExitCodes.RunFailed;
		return;
	}

	printResult({
		clientLabel: 'Codex CLI',
		serverUrl: url,
		authDescription: `Bearer token from APIFY_TOKEN environment variable`,
		configPath: tomlPath,
		nextSteps: `  ${chalk.yellow('Next:')}      Codex reads APIFY_TOKEN from the environment. Before launching codex, run:\n\n    export APIFY_TOKEN=<your-token>`,
	});
};

const kiroHandler: ClientHandler = async ({ url, token, yes }) => {
	const filePath = join(userHomeDir(), '.kiro', 'settings', 'mcp.json');
	const serverEntry = {
		url,
		headers: { Authorization: `Bearer ${token}` },
		disabled: false,
		autoApprove: [] as string[],
	};

	const wrote = await mergeServerEntry({ filePath, topLevelKey: 'mcpServers', entryKey: SERVER_KEY, serverEntry, yes });
	if (!wrote) return;

	printResult({
		clientLabel: 'Kiro',
		serverUrl: url,
		authDescription: `Bearer ${maskToken(token)}`,
		configPath: filePath,
	});
};

const antigravityHandler: ClientHandler = async ({ url, token, yes }) => {
	const filePath = join(userHomeDir(), '.gemini', 'antigravity', 'mcp_config.json');
	// Antigravity uses 'serverUrl' (not 'url'); see https://antigravity.google/docs/mcp.
	const serverEntry = { serverUrl: url, headers: { Authorization: `Bearer ${token}` } };

	const wrote = await mergeServerEntry({ filePath, topLevelKey: 'mcpServers', entryKey: SERVER_KEY, serverEntry, yes });
	if (!wrote) return;

	printResult({
		clientLabel: 'Antigravity',
		serverUrl: url,
		authDescription: `Bearer ${maskToken(token)}`,
		configPath: filePath,
	});
};

const HANDLERS: Record<ClientName, ClientHandler> = {
	'claude-code': claudeCodeHandler,
	cursor: cursorHandler,
	vscode: vscodeHandler,
	'vscode-insiders': vscodeInsidersHandler,
	codex: codexHandler,
	kiro: kiroHandler,
	antigravity: antigravityHandler,
};

export function getClientHandler(name: ClientName): ClientHandler {
	return HANDLERS[name];
}
