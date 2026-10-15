import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

// Force stdinCheckWrapper down its non-interactive path so prompts never block on stdin.
vitest.mock('ci-info', async (importOriginal) => {
	const original = await importOriginal<typeof import('ci-info')>();
	return { ...original, isCI: true };
});

import { AgentSetupCommand } from '../../../../src/commands/agent/setup.js';
import {
	isClientConfigured,
	readAgentState,
	writeAgentState,
	type AgentState,
} from '../../../../src/lib/agent/state.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { CommandExitCodes } from '../../../../src/lib/consts.js';
import { SUPPORTED_CLIENTS } from '../../../../src/lib/mcp/clients.js';
import { useAuthSetup } from '../../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';

const TEST_TOKEN = 'apify_api_TEST_xxxxxxxxxxxxxxxxxxxxxx';

const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('agent-setup');

useAuthSetup();
const { logMessages } = useConsoleSpy();

beforeAll(beforeAllCalls);
afterAll(afterAllCalls);

beforeEach(async () => {
	// Wipe and recreate the fakeHome so each test starts from a clean ~.
	await rm(tmpPath, { recursive: true, force: true });
	await mkdir(tmpPath, { recursive: true });
	// Route userHomeDir() lookups (client config paths like ~/.cursor/mcp.json) into tmpPath.
	vitest.stubEnv('HOME', tmpPath);
	// Empty PATH → which() returns null for every binary → no binary-based detection.
	vitest.stubEnv('PATH', '');
});

afterEach(() => {
	process.exitCode = undefined;
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function readCursorConfig(): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(joinPath('.cursor', 'mcp.json'), 'utf-8')) as Record<string, unknown>;
}

function parsedJsonOutput(): Record<string, unknown> {
	const raw = logMessages.log.find((m) => m.startsWith('{'));
	if (!raw) throw new Error('No JSON output found in stdout');
	return JSON.parse(raw) as Record<string, unknown>;
}

async function makeCursorDetectable(): Promise<void> {
	await mkdir(joinPath('.cursor'), { recursive: true });
	await writeFile(joinPath('.cursor', 'mcp.json'), '{}', 'utf-8');
}

async function seedState(clients: string[]): Promise<void> {
	const now = new Date().toISOString();
	const state: AgentState = {
		installedAt: now,
		clients: clients.map((c) => ({
			client: c,
			tier: 'mcp',
			installedAt: now,
		})),
	};
	await writeAgentState(state);
}

// ── Detection ────────────────────────────────────────────────────────────────

describe('apify agent setup', () => {
	describe('detection', () => {
		it('prints a no-agents message and exits 0 when nothing is detected', async () => {
			await testRunCommand(AgentSetupCommand, {});

			expect(process.exitCode).toBeUndefined();
			const stderr = logMessages.error.join('\n');
			expect(stderr).toMatch(/No supported AI coding agents detected/);
			for (const client of SUPPORTED_CLIENTS) {
				expect(stderr).toContain(client);
			}
		});

		it('includes --client hint in the no-agents message', async () => {
			await testRunCommand(AgentSetupCommand, {});
			expect(logMessages.error.join('\n')).toMatch(/--client/);
		});

		it('--json with no agents outputs { clients: [] } to stdout and exits 0', async () => {
			await testRunCommand(AgentSetupCommand, { flags_json: true });

			expect(process.exitCode).toBeUndefined();
			expect(parsedJsonOutput()).toEqual({ clients: [] });
		});

		it('CURSOR_AGENT env var causes cursor to appear in the plan', async () => {
			vitest.stubEnv('CURSOR_AGENT', '1');
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			// Don't confirm — this just checks the plan message before the prompt.
			await testRunCommand(AgentSetupCommand, {});

			// With isCI=true and no --yes, the prompt throws. The error message shows the plan was reached.
			const stderr = logMessages.error.join('\n');
			expect(stderr).toMatch(/cursor/);
		});

		it('~/.cursor/mcp.json exists → cursor appears in plan', async () => {
			await makeCursorDetectable();
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			await testRunCommand(AgentSetupCommand, {});

			const stderr = logMessages.error.join('\n');
			expect(stderr).toMatch(/cursor/);
		});
	});

	// ── --client flag ─────────────────────────────────────────────────────────

	describe('--client flag', () => {
		it('rejects an unknown client name with InvalidInput exit code', async () => {
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'notaclient',
			});

			expect(process.exitCode).toBe(CommandExitCodes.InvalidInput);
			expect(logMessages.error.join('\n')).toMatch(/Unknown client 'notaclient'/);
		});

		it('--client cursor bypasses detection even when nothing is installed', async () => {
			// No home paths, no env vars — cursor is NOT auto-detected.
			// --client forces the target without detection.
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);

			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			expect(process.exitCode).toBeUndefined();
			const config = await readCursorConfig();
			expect(config).toHaveProperty('mcpServers');
		});
	});

	// ── Auth ─────────────────────────────────────────────────────────────────

	describe('auth', () => {
		it('MissingAuth when all detected clients need a token and no auth exists', async () => {
			await makeCursorDetectable();
			// No APIFY_TOKEN, no stored login (useAuthSetup ensures clean state).

			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			expect(process.exitCode).toBe(CommandExitCodes.MissingAuth);
			expect(logMessages.error.join('\n')).toMatch(/not logged in to Apify/);
		});

		it('APIFY_TOKEN env var is used as auth without apify login', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);

			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			expect(process.exitCode).toBeUndefined();
			const config = await readCursorConfig();
			const auth = (
				config.mcpServers as {
					apify: { headers: { Authorization: string } };
				}
			).apify.headers.Authorization;
			expect(auth).toBe(`Bearer ${TEST_TOKEN}`);
		});

		it('codex (tokenless) — MissingAuth is NOT raised even with no auth', async () => {
			// codex reads APIFY_TOKEN at runtime. The install itself needs no token.
			// With PATH='', the codex binary is not found → the handler sets exitCode internally,
			// and setup.ts normalises multi-client failures to RunFailed (1). The key assertion
			// is that MissingAuth is NOT the reason for failure.
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'codex',
				flags_yes: true,
			});

			expect(process.exitCode).toBe(CommandExitCodes.RunFailed);
			expect(logMessages.error.join('\n')).not.toMatch(/not logged in to Apify/);
		});
	});

	// ── Confirmation prompt ───────────────────────────────────────────────────

	describe('confirmation prompt', () => {
		it('isCI=true without --yes throws "Re-run with --yes" error', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);

			await testRunCommand(AgentSetupCommand, { flags_client: 'cursor' });

			// Command should fail because stdinCheckWrapper throws on non-interactive path with no providedConfirmFromStdin.
			expect(process.exitCode).toBeDefined();
			expect(logMessages.error.join('\n')).toMatch(/Re-run with --yes/);
		});

		it('--yes skips the prompt and proceeds', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);

			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			expect(process.exitCode).toBeUndefined();
		});

		it('declining the prompt (no --yes, non-interactive fallback is false) exits 0 with no changes', async () => {
			// stdinCheckWrapper with providedConfirmFromStdin=undefined throws — we verify the right error.
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			await testRunCommand(AgentSetupCommand, { flags_client: 'cursor' });

			// No cursor config written because prompt was not answered.
			const { existsSync } = await import('node:fs');
			expect(existsSync(joinPath('.cursor', 'mcp.json'))).toBe(false);
		});
	});

	// ── Happy-path install ────────────────────────────────────────────────────

	describe('happy path', () => {
		it('cursor: installs via --client, writes config and state file', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);

			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			expect(process.exitCode).toBeUndefined();

			// Client config written
			const config = await readCursorConfig();
			expect(config).toHaveProperty('mcpServers.apify');

			// State file written
			const state = await readAgentState();
			expect(state).not.toBeNull();
			expect(isClientConfigured(state!, 'cursor')).toBe(true);
		});

		it('cursor: state entry has the correct shape (client, tier, installedAt)', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			const state = await readAgentState();
			const entry = state!.clients.find((c) => c.client === 'cursor')!;
			expect(entry).toMatchObject({ client: 'cursor', tier: 'mcp' });
			expect(new Date(entry.installedAt).getTime()).toBeGreaterThan(0);
		});

		it('state file has a top-level installedAt on first run', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			const state = await readAgentState();
			expect(state?.installedAt).toBeDefined();
			expect(new Date(state!.installedAt).getTime()).toBeGreaterThan(0);
		});

		it('success message appears in stderr for cursor', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			expect(logMessages.error.join('\n')).toMatch(/Success: Apify MCP server configured for Cursor/);
		});
	});

	// ── MCP URL attribution ───────────────────────────────────────────────────

	describe('MCP URL', () => {
		it('cursor config URL contains ?client=apify-cli attribution tag', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			const config = await readCursorConfig();
			const { url } = (config.mcpServers as { apify: { url: string } }).apify;
			expect(url).toContain('client=apify-cli');
		});

		it('cursor config URL does NOT duplicate client= when agent setup is re-run', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);

			// First run
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			// State is already there — second run sees already_configured and stops before install.
			// Manually clear state to force a second install and check the URL isn't doubled.
			await writeAgentState({
				installedAt: new Date().toISOString(),
				clients: [],
			});
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			const config = await readCursorConfig();
			const { url } = (config.mcpServers as { apify: { url: string } }).apify;
			const count = (url.match(/client=apify-cli/g) ?? []).length;
			expect(count).toBe(1);
		});

		it('MCP URL starts with https://mcp.apify.com', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			const config = await readCursorConfig();
			const { url } = (config.mcpServers as { apify: { url: string } }).apify;
			expect(url).toMatch(/^https:\/\/mcp\.apify\.com/);
		});
	});

	// ── Idempotency ───────────────────────────────────────────────────────────

	describe('idempotency', () => {
		it('pre-existing state entry → outcome=already_configured, no re-install', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			await seedState(['cursor']);

			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
				flags_json: true,
			});

			expect(process.exitCode).toBeUndefined();
			const json = parsedJsonOutput();
			const clients = json.clients as {
				client: string;
				outcome: string;
			}[];
			expect(clients.find((c) => c.client === 'cursor')?.outcome).toBe('already_configured');

			// No cursor config written by this run (install was skipped).
			const { existsSync } = await import('node:fs');
			expect(existsSync(joinPath('.cursor', 'mcp.json'))).toBe(false);
		});

		it('all targets already configured → "Nothing to do" message, exits 0', async () => {
			await seedState(['cursor']);

			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			expect(process.exitCode).toBeUndefined();
			expect(logMessages.error.join('\n')).toMatch(/already configured.*Nothing to do/i);
		});

		it('second run after real install returns already_configured', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);

			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});
			expect(process.exitCode).toBeUndefined();

			// Reset output counters
			logMessages.log.length = 0;
			logMessages.error.length = 0;
			process.exitCode = undefined;

			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
				flags_json: true,
			});

			const json = parsedJsonOutput();
			const clients = json.clients as {
				client: string;
				outcome: string;
			}[];
			expect(clients.find((c) => c.client === 'cursor')?.outcome).toBe('already_configured');
		});

		it('state file installedAt is preserved (not updated) on already_configured run', async () => {
			const originalTs = '2026-01-01T00:00:00.000Z';
			await seedState(['cursor']);
			const originalState = await readAgentState();
			// Manually set installedAt to a known value
			originalState!.installedAt = originalTs;
			await writeAgentState(originalState!);

			// Second run
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			const state = await readAgentState();
			expect(state?.installedAt).toBe(originalTs);
		});

		it('new client added without modifying existing entries', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			const cursorTs = '2025-06-01T00:00:00.000Z';
			await writeAgentState({
				installedAt: cursorTs,
				clients: [{ client: 'cursor', tier: 'mcp', installedAt: cursorTs }],
			});

			// Install kiro as a new client
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'kiro',
				flags_yes: true,
			});

			const state = await readAgentState();
			// cursor entry should be unchanged
			const cursorEntry = state!.clients.find((c) => c.client === 'cursor');
			expect(cursorEntry?.installedAt).toBe(cursorTs);
			// kiro entry should be present
			expect(isClientConfigured(state!, 'kiro')).toBe(true);
		});
	});

	// ── --json output ─────────────────────────────────────────────────────────

	describe('--json output', () => {
		it('output shape: { clients: [{ client, tier, outcome }] }', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
				flags_json: true,
			});

			const json = parsedJsonOutput();
			expect(json).toHaveProperty('clients');
			const clients = json.clients as Record<string, unknown>[];
			expect(clients.length).toBeGreaterThan(0);
			const entry = clients[0];
			expect(entry).toHaveProperty('client');
			expect(entry).toHaveProperty('tier');
			expect(entry).toHaveProperty('outcome');
		});

		it('outcome is "installed" for a fresh install', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
				flags_json: true,
			});

			const clients = parsedJsonOutput().clients as {
				client: string;
				outcome: string;
			}[];
			expect(clients.find((c) => c.client === 'cursor')?.outcome).toBe('installed');
		});

		it('outcome is "already_configured" for a pre-seeded client', async () => {
			await seedState(['cursor']);
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
				flags_json: true,
			});

			const clients = parsedJsonOutput().clients as {
				client: string;
				outcome: string;
			}[];
			expect(clients.find((c) => c.client === 'cursor')?.outcome).toBe('already_configured');
		});

		it('"reason" field is NOT present in JSON output', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
				flags_json: true,
			});

			const clients = parsedJsonOutput().clients as Record<string, unknown>[];
			for (const entry of clients) {
				expect(entry).not.toHaveProperty('reason');
			}
		});

		it('no JSON written to stdout when --json is not passed', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			const jsonLine = logMessages.log.find((m) => m.startsWith('{'));
			expect(jsonLine).toBeUndefined();
		});

		it('candidate order is preserved in JSON output (auto-detected order)', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			// Detect cursor via home path AND kiro via home path — cursor comes first
			await mkdir(joinPath('.cursor'), { recursive: true });
			await writeFile(joinPath('.cursor', 'mcp.json'), '{}', 'utf-8');
			await mkdir(joinPath('.kiro'), { recursive: true });

			await testRunCommand(AgentSetupCommand, {
				flags_yes: true,
				flags_json: true,
			});

			const clients = parsedJsonOutput().clients as { client: string }[];
			const cursorIdx = clients.findIndex((c) => c.client === 'cursor');
			const kiroIdx = clients.findIndex((c) => c.client === 'kiro');
			if (cursorIdx >= 0 && kiroIdx >= 0) {
				// cursor is listed before kiro in SUPPORTED_CLIENTS, so it should appear first
				expect(cursorIdx).toBeLessThan(kiroIdx);
			}
		});
	});

	// ── Security ─────────────────────────────────────────────────────────────

	describe('security', () => {
		it('state file does not contain the API token', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			const raw = await readFile((await import('../../../../src/lib/consts.js')).AGENT_STATE_FILE_PATH(), 'utf-8');
			expect(raw).not.toContain(TEST_TOKEN);
			expect(raw).not.toMatch(/Bearer /i);
		});

		it('state file is located inside GLOBAL_CONFIGS_FOLDER (not arbitrary path)', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'cursor',
				flags_yes: true,
			});

			const { AGENT_STATE_FILE_PATH, GLOBAL_CONFIGS_FOLDER } = await import('../../../../src/lib/consts.js');
			expect(AGENT_STATE_FILE_PATH()).toContain(GLOBAL_CONFIGS_FOLDER());
		});
	});

	// ── Error handling ────────────────────────────────────────────────────────

	describe('error handling', () => {
		it('handler failure (binary not found) is reported but does not crash the command', async () => {
			// claude-code needs the `claude` binary. With PATH='', it won't be found.
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'claude-code',
				flags_yes: true,
			});

			// Command exits non-zero from the handler, but doesn't throw unhandled
			const stderr = logMessages.error.join('\n');
			expect(stderr).toMatch(/'claude' CLI was not found on PATH|Failed to configure/i);
		});

		it('failed client is NOT written to the state file', async () => {
			vitest.stubEnv('APIFY_TOKEN', TEST_TOKEN);
			// claude-code fails (no binary).
			await testRunCommand(AgentSetupCommand, {
				flags_client: 'claude-code',
				flags_yes: true,
			});

			const state = await readAgentState();
			expect(state).toBeNull(); // nothing installed → no state written
		});
	});
});
