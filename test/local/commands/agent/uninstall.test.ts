import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import process from 'node:process';

vitest.mock('ci-info', async (importOriginal) => {
	const original = await importOriginal<typeof import('ci-info')>();
	return { ...original, isCI: true };
});

import { AgentUninstallCommand } from '../../../../src/commands/agent/uninstall.js';
import {
	isClientConfigured,
	readAgentState,
	writeAgentState,
	type AgentState,
} from '../../../../src/lib/agent/state.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { CommandExitCodes } from '../../../../src/lib/consts.js';
import { useAuthSetup } from '../../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';

const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('agent-uninstall');

useAuthSetup();
const { logMessages } = useConsoleSpy();

beforeAll(beforeAllCalls);
afterAll(afterAllCalls);

beforeEach(async () => {
	await rm(tmpPath, { recursive: true, force: true });
	await mkdir(tmpPath, { recursive: true });
	vitest.stubEnv('HOME', tmpPath);
	vitest.stubEnv('PATH', '');
});

afterEach(() => {
	process.exitCode = undefined;
	vitest.unstubAllEnvs();
});

const FIXED_TS = '2026-01-01T00:00:00.000Z';

async function seedState(clients: string[]): Promise<AgentState> {
	const state: AgentState = {
		installedAt: FIXED_TS,
		clients: clients.map((c) => ({
			client: c,
			tier: 'mcp',
			installedAt: FIXED_TS,
		})),
	};
	await writeAgentState(state);
	return state;
}

async function writeCursorConfig(content: Record<string, unknown> = {}): Promise<void> {
	await mkdir(joinPath('.cursor'), { recursive: true });
	await writeFile(joinPath('.cursor', 'mcp.json'), JSON.stringify(content), 'utf-8');
}

async function readCursorConfig(): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(joinPath('.cursor', 'mcp.json'), 'utf-8')) as Record<string, unknown>;
}

function parsedJsonOutput(): Record<string, unknown> {
	const raw = logMessages.log.find((m) => m.startsWith('{'));
	if (!raw) throw new Error('No JSON output found in stdout');
	return JSON.parse(raw) as Record<string, unknown>;
}

// ── Nothing to do ────────────────────────────────────────────────────────────

describe('apify agent uninstall', () => {
	describe('nothing to do', () => {
		it('exits 0 with a message when no state file exists', async () => {
			await testRunCommand(AgentUninstallCommand, { flags_yes: true });

			expect(process.exitCode).toBeUndefined();
			expect(logMessages.error.join('\n')).toMatch(/No agents configured/);
		});

		it('--json outputs { clients: [] } when nothing is configured', async () => {
			await testRunCommand(AgentUninstallCommand, {
				flags_yes: true,
				flags_json: true,
			});

			expect(parsedJsonOutput()).toEqual({ clients: [] });
		});

		it('--client on unconfigured client reports not_configured, exits 0', async () => {
			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			expect(process.exitCode).toBeUndefined();
			expect(logMessages.error.join('\n')).toMatch(/not configured/i);
		});

		it('--client not_configured with --json includes outcome field', async () => {
			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'cursor',
				flags_yes: true,
				flags_json: true,
			});

			const json = parsedJsonOutput();
			const clients = json.clients as {
				client: string;
				outcome: string;
			}[];
			expect(clients[0]).toMatchObject({
				client: 'cursor',
				outcome: 'not_configured',
			});
		});
	});

	// ── --client flag validation ──────────────────────────────────────────────

	describe('--client flag validation', () => {
		it('rejects unknown client with InvalidInput exit code', async () => {
			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'notaclient',
				flags_yes: true,
			});
			expect(process.exitCode).toBe(CommandExitCodes.InvalidInput);
		});

		it('error message names the invalid client', async () => {
			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'notaclient',
				flags_yes: true,
			});
			expect(logMessages.error.join('\n')).toMatch(/Unknown client 'notaclient'/);
		});
	});

	// ── Confirmation prompt ───────────────────────────────────────────────────

	describe('confirmation prompt', () => {
		it('isCI=true without --yes logs "Re-run with --yes" and sets exit code', async () => {
			await seedState(['cursor']);

			// _run catches the stdinCheckWrapper throw, logs it, and sets exitCode.
			// testRunCommand resolves (does not reject) — assert on observable side effects.
			await testRunCommand(AgentUninstallCommand, {});

			expect(process.exitCode).toBeDefined();
			expect(logMessages.error.join('\n')).toMatch(/Re-run with --yes/);
		});

		it('--yes skips the prompt and proceeds', async () => {
			await seedState(['cursor']);
			await writeCursorConfig({
				mcpServers: { apify: { url: 'https://mcp.apify.com' } },
			});

			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			expect(process.exitCode).toBeUndefined();
		});

		it('without --yes the state file is left unchanged', async () => {
			await seedState(['cursor']);

			await testRunCommand(AgentUninstallCommand, {});

			// Whether the prompt threw (non-interactive) or returned false (declined),
			// the state update block is never reached — cursor must still be present.
			const state = await readAgentState();
			expect(isClientConfigured(state!, 'cursor')).toBe(true);
		});
	});

	// ── Happy path — file-based client (cursor) ───────────────────────────────

	describe('happy path — file-based client (cursor)', () => {
		it('removes the apify key from cursor mcp.json', async () => {
			await seedState(['cursor']);
			await writeCursorConfig({
				mcpServers: {
					apify: {
						url: 'https://mcp.apify.com',
						headers: { Authorization: 'Bearer tok' },
					},
					'other-server': { url: 'https://other.example.com' },
				},
			});

			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			expect(process.exitCode).toBeUndefined();
			const config = await readCursorConfig();
			const servers = config.mcpServers as Record<string, unknown>;
			expect(servers).not.toHaveProperty('apify');
			expect(servers).toHaveProperty('other-server');
		});

		it('preserves other servers in the config file after removal', async () => {
			await seedState(['cursor']);
			await writeCursorConfig({
				mcpServers: {
					apify: { url: 'https://mcp.apify.com' },
					'keep-me': { url: 'https://keep.example.com' },
				},
			});

			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			const config = await readCursorConfig();
			const servers = config.mcpServers as Record<string, unknown>;
			expect(servers).toHaveProperty('keep-me');
		});

		it('removes cursor from the state file after uninstall', async () => {
			await seedState(['cursor', 'kiro']);
			await writeCursorConfig({
				mcpServers: { apify: { url: 'https://mcp.apify.com' } },
			});

			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			const state = await readAgentState();
			expect(isClientConfigured(state!, 'cursor')).toBe(false);
			expect(isClientConfigured(state!, 'kiro')).toBe(true);
		});

		it('state file still exists after uninstalling one of many clients', async () => {
			await seedState(['cursor', 'kiro']);
			await writeCursorConfig({
				mcpServers: { apify: { url: 'https://mcp.apify.com' } },
			});

			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			const state = await readAgentState();
			expect(state).not.toBeNull();
		});

		it('state file has zero clients after uninstalling the only configured client', async () => {
			await seedState(['cursor']);
			await writeCursorConfig({
				mcpServers: { apify: { url: 'https://mcp.apify.com' } },
			});

			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			const state = await readAgentState();
			expect(state!.clients).toHaveLength(0);
		});

		it('gracefully handles cursor config file already missing the apify entry', async () => {
			await seedState(['cursor']);
			await writeCursorConfig({
				mcpServers: {
					'other-server': { url: 'https://other.example.com' },
				},
			});

			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			// Should still exit 0 — nothing to remove is not a failure
			expect(process.exitCode).toBeUndefined();
		});

		it('gracefully handles cursor config file entirely absent', async () => {
			await seedState(['cursor']);
			// No writeCursorConfig call — the file does not exist at all

			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			expect(process.exitCode).toBeUndefined();
		});

		it('removes cursor from state even when config file was absent', async () => {
			await seedState(['cursor', 'kiro']);
			// No cursor config file — removeServerEntry returns false
			await mkdir(joinPath('.kiro', 'settings'), { recursive: true });
			await writeFile(
				joinPath('.kiro', 'settings', 'mcp.json'),
				JSON.stringify({
					mcpServers: { apify: { url: 'https://mcp.apify.com' } },
				}),
				'utf-8',
			);

			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			const state = await readAgentState();
			expect(isClientConfigured(state!, 'cursor')).toBe(false);
		});
	});

	// ── Uninstall all ─────────────────────────────────────────────────────────

	describe('uninstall all (no --client)', () => {
		it('uninstalls all configured file-based clients', async () => {
			await seedState(['cursor', 'kiro']);

			await mkdir(joinPath('.cursor'), { recursive: true });
			await writeFile(
				joinPath('.cursor', 'mcp.json'),
				JSON.stringify({
					mcpServers: { apify: { url: 'https://mcp.apify.com' } },
				}),
				'utf-8',
			);
			await mkdir(joinPath('.kiro', 'settings'), { recursive: true });
			await writeFile(
				joinPath('.kiro', 'settings', 'mcp.json'),
				JSON.stringify({
					mcpServers: { apify: { url: 'https://mcp.apify.com' } },
				}),
				'utf-8',
			);

			await testRunCommand(AgentUninstallCommand, { flags_yes: true });

			const state = await readAgentState();
			expect(state!.clients).toHaveLength(0);
		});

		it('--json output lists all uninstalled clients', async () => {
			await seedState(['cursor', 'kiro']);
			await mkdir(joinPath('.cursor'), { recursive: true });
			await writeFile(joinPath('.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { apify: {} } }), 'utf-8');
			await mkdir(joinPath('.kiro', 'settings'), { recursive: true });
			await writeFile(
				joinPath('.kiro', 'settings', 'mcp.json'),
				JSON.stringify({ mcpServers: { apify: {} } }),
				'utf-8',
			);

			await testRunCommand(AgentUninstallCommand, {
				flags_yes: true,
				flags_json: true,
			});

			const json = parsedJsonOutput();
			const clients = json.clients as {
				client: string;
				outcome: string;
			}[];
			expect(clients.map((c) => c.client)).toEqual(expect.arrayContaining(['cursor', 'kiro']));
			for (const c of clients) expect(c.outcome).toBe('uninstalled');
		});
	});

	// ── --json output shape ───────────────────────────────────────────────────

	describe('--json output shape', () => {
		it('outcome is "uninstalled" for a successfully removed client', async () => {
			await seedState(['cursor']);
			await writeCursorConfig({
				mcpServers: { apify: { url: 'https://mcp.apify.com' } },
			});

			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'cursor',
				flags_yes: true,
				flags_json: true,
			});

			const clients = parsedJsonOutput().clients as {
				client: string;
				outcome: string;
			}[];
			expect(clients.find((c) => c.client === 'cursor')?.outcome).toBe('uninstalled');
		});

		it('"reason" field is NOT present in JSON output', async () => {
			await seedState(['cursor']);
			await writeCursorConfig({
				mcpServers: { apify: { url: 'https://mcp.apify.com' } },
			});

			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'cursor',
				flags_yes: true,
				flags_json: true,
			});

			const clients = parsedJsonOutput().clients as Record<string, unknown>[];
			for (const entry of clients) expect(entry).not.toHaveProperty('reason');
		});
	});

	// ── CLI-based client failure ──────────────────────────────────────────────

	describe('CLI-based client failure (binary not found)', () => {
		it('claude-code: binary not on PATH → outcome=failed, RunFailed exit code', async () => {
			await seedState(['claude-code']);

			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'claude-code',
				flags_yes: true,
			});

			expect(process.exitCode).toBe(CommandExitCodes.RunFailed);
		});

		it('failed client is NOT removed from the state file', async () => {
			await seedState(['claude-code']);

			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'claude-code',
				flags_yes: true,
			});

			const state = await readAgentState();
			expect(isClientConfigured(state!, 'claude-code')).toBe(true);
		});

		it('partial failure: cursor succeeds, claude-code fails → RunFailed + cursor removed, claude-code kept', async () => {
			await seedState(['cursor', 'claude-code']);
			await writeCursorConfig({
				mcpServers: { apify: { url: 'https://mcp.apify.com' } },
			});

			await testRunCommand(AgentUninstallCommand, { flags_yes: true });

			// Overall result is failure because claude-code failed
			expect(process.exitCode).toBe(CommandExitCodes.RunFailed);

			// cursor succeeded → removed from state
			const state = await readAgentState();
			expect(isClientConfigured(state!, 'cursor')).toBe(false);

			// claude-code failed → kept in state
			expect(isClientConfigured(state!, 'claude-code')).toBe(true);
		});

		it('partial failure --json: cursor outcome=uninstalled, claude-code outcome=failed', async () => {
			await seedState(['cursor', 'claude-code']);
			await writeCursorConfig({
				mcpServers: { apify: { url: 'https://mcp.apify.com' } },
			});

			await testRunCommand(AgentUninstallCommand, {
				flags_yes: true,
				flags_json: true,
			});

			const json = parsedJsonOutput();
			const clients = json.clients as {
				client: string;
				outcome: string;
			}[];
			const cursorEntry = clients.find((c) => c.client === 'cursor');
			const claudeEntry = clients.find((c) => c.client === 'claude-code');
			expect(cursorEntry?.outcome).toBe('uninstalled');
			expect(claudeEntry?.outcome).toBe('failed');
		});
	});

	// ── Security ─────────────────────────────────────────────────────────────

	describe('security', () => {
		it('no bearer token appears in any output after uninstall', async () => {
			await seedState(['cursor']);
			await writeCursorConfig({
				mcpServers: {
					apify: {
						url: 'https://mcp.apify.com',
						headers: { Authorization: 'Bearer apify_api_SECRET' },
					},
				},
			});

			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			const allOutput = [...logMessages.log, ...logMessages.error].join('\n');
			expect(allOutput).not.toMatch(/apify_api_/i);
		});

		it('cursor config file does not contain the token after uninstall', async () => {
			await seedState(['cursor']);
			await writeCursorConfig({
				mcpServers: {
					apify: {
						url: 'https://mcp.apify.com',
						headers: { Authorization: 'Bearer apify_api_SECRET' },
					},
					'other-server': { url: 'https://other.example.com' },
				},
			});

			await testRunCommand(AgentUninstallCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			expect(existsSync(joinPath('.cursor', 'mcp.json'))).toBe(true);
			const raw = await readFile(joinPath('.cursor', 'mcp.json'), 'utf-8');
			expect(raw).not.toMatch(/apify_api_SECRET/);
		});
	});
});
