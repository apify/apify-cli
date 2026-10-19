import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import which from 'which';

import { type ClientName, SUPPORTED_CLIENTS } from '../mcp/clients.js';
import { AGENT_ENV_VARS } from '../nonInteractiveMode.js';
import { userHomeDir } from '../utils.js';

// Maps the agent identifier used in AGENT_ENV_VARS to the catalog client key.
const AGENT_ID_TO_CLIENT: Partial<Record<string, ClientName>> = {
	claude_code: 'claude-code',
	cursor: 'cursor',
	codex_cli: 'codex',
	openclaw: 'antigravity',
};

interface DetectionStrategy {
	binaries?: string[]; // any on PATH → detected
	homePaths?: string[]; // relative to ~, any exists → detected
}

// Per-client detection signals. Env-var detection is handled separately via AGENT_ENV_VARS.
const DETECTION_MAP: Partial<Record<ClientName, DetectionStrategy>> = {
	'claude-code': { binaries: ['claude'], homePaths: ['.claude'] },
	cursor: { binaries: ['cursor'], homePaths: ['.cursor/mcp.json'] },
	vscode: { binaries: ['code'], homePaths: ['.vscode'] },
	'vscode-insiders': { binaries: ['code-insiders'], homePaths: ['.vscode-insiders'] },
	codex: { binaries: ['codex'] },
	kiro: { homePaths: ['.kiro'] },
	antigravity: { homePaths: ['.gemini/antigravity'] },
};

function detectFromEnv(): Set<ClientName> {
	const found = new Set<ClientName>();
	for (const [envVar, agentId] of AGENT_ENV_VARS) {
		if (process.env[envVar]) {
			const client = AGENT_ID_TO_CLIENT[agentId];
			if (client) found.add(client);
		}
	}
	return found;
}

async function detectFromBinariesAndPaths(): Promise<Set<ClientName>> {
	const home = userHomeDir();
	const results = await Promise.all(
		SUPPORTED_CLIENTS.map(async (client) => {
			const strategy = DETECTION_MAP[client];
			if (!strategy) return null;

			for (const bin of strategy.binaries ?? []) {
				if (await which(bin, { nothrow: true })) return client;
			}

			if (home) {
				for (const rel of strategy.homePaths ?? []) {
					if (existsSync(join(home, rel))) return client;
				}
			}

			return null;
		}),
	);
	return new Set(results.filter((c): c is ClientName => c !== null));
}

/**
 * Returns catalog clients detected on this machine.
 * Env-var-detected clients (agent is currently active) come first,
 * then binary/path-detected clients (installed but not currently running).
 */
export async function detectClients(): Promise<ClientName[]> {
	const envSet = detectFromEnv();
	const fsSet = await detectFromBinariesAndPaths();
	return [...new Set([...envSet, ...fsSet])];
}
