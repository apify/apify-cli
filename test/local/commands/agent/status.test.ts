import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';

vitest.mock('ci-info', async (importOriginal) => {
	const original = await importOriginal<typeof import('ci-info')>();
	return { ...original, isCI: true };
});

import { AgentStatusCommand } from '../../../../src/commands/agent/status.js';
import { writeAgentState, type AgentState } from '../../../../src/lib/agent/state.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { CommandExitCodes } from '../../../../src/lib/consts.js';
import { useAuthSetup } from '../../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';

const { tmpPath, beforeAllCalls, afterAllCalls } = useTempPath('agent-status');

useAuthSetup();
const { logMessages } = useConsoleSpy();

beforeAll(beforeAllCalls);
afterAll(afterAllCalls);

beforeEach(async () => {
	await mkdir(tmpPath, { recursive: true });
	vitest.stubEnv('HOME', tmpPath);
	vitest.stubEnv('PATH', '');
});

afterEach(() => {
	process.exitCode = undefined;
	vitest.unstubAllEnvs();
});

const FIXED_TS = '2026-01-01T00:00:00.000Z';

async function seedState(clients: string[]): Promise<void> {
	const state: AgentState = {
		installedAt: FIXED_TS,
		clients: clients.map((c) => ({
			client: c,
			tier: 'mcp',
			installedAt: FIXED_TS,
		})),
	};
	await writeAgentState(state);
}

// ── No state ──────────────────────────────────────────────────────────────────

describe('apify agent status', () => {
	describe('no state', () => {
		it('prints a "no agents configured" message when state file is absent', async () => {
			await testRunCommand(AgentStatusCommand, {});

			expect(process.exitCode).toBeUndefined();
			expect(logMessages.error.join('\n')).toMatch(/No agents configured/);
		});

		it('exits 0 when no state file', async () => {
			await testRunCommand(AgentStatusCommand, {});
			expect(process.exitCode).toBeUndefined();
		});

		it('--json outputs { clients: [] } when no state file', async () => {
			await testRunCommand(AgentStatusCommand, { flags_json: true });

			const raw = logMessages.log.find((m) => m.startsWith('{'));
			expect(raw).toBeDefined();
			expect(JSON.parse(raw!)).toEqual({ clients: [] });
		});

		it('mentions `apify agent setup` in the no-agents message', async () => {
			await testRunCommand(AgentStatusCommand, {});
			expect(logMessages.error.join('\n')).toMatch(/apify agent setup/);
		});
	});

	// ── Empty state ─────────────────────────────────────────────────────────────

	describe('empty state (state file exists but clients array is empty)', () => {
		it('prints "no agents configured" when state exists but has no clients', async () => {
			await seedState([]);
			await testRunCommand(AgentStatusCommand, {});

			expect(process.exitCode).toBeUndefined();
			expect(logMessages.error.join('\n')).toMatch(/No agents configured/);
		});

		it('--json outputs { clients: [] } when state has no clients', async () => {
			await seedState([]);
			await testRunCommand(AgentStatusCommand, { flags_json: true });

			const raw = logMessages.log.find((m) => m.startsWith('{'));
			expect(JSON.parse(raw!)).toEqual({ clients: [] });
		});
	});

	// ── With state ──────────────────────────────────────────────────────────────

	describe('with state', () => {
		it('shows all configured clients when state exists', async () => {
			await seedState(['cursor', 'kiro']);
			await testRunCommand(AgentStatusCommand, {});

			const out = logMessages.error.join('\n');
			expect(out).toMatch(/cursor/);
			expect(out).toMatch(/kiro/);
		});

		it('shows the tier for each client', async () => {
			await seedState(['cursor']);
			await testRunCommand(AgentStatusCommand, {});
			expect(logMessages.error.join('\n')).toMatch(/mcp tier/);
		});

		it('exits 0 with configured clients', async () => {
			await seedState(['cursor']);
			await testRunCommand(AgentStatusCommand, {});
			expect(process.exitCode).toBeUndefined();
		});

		it('human-readable output includes the install date', async () => {
			await seedState(['cursor']);
			await testRunCommand(AgentStatusCommand, {});

			// FIXED_TS = '2026-01-01T00:00:00.000Z' → toLocaleDateString() is locale-dependent
			// but must contain at least the year 2026.
			expect(logMessages.error.join('\n')).toMatch(/2026/);
		});

		it('--json outputs clients array with correct shape', async () => {
			await seedState(['cursor']);
			await testRunCommand(AgentStatusCommand, { flags_json: true });

			const raw = logMessages.log.find((m) => m.startsWith('{'));
			const json = JSON.parse(raw!) as {
				clients: {
					client: string;
					tier: string;
					installedAt: string;
				}[];
			};
			expect(json.clients).toHaveLength(1);
			expect(json.clients[0]).toMatchObject({
				client: 'cursor',
				tier: 'mcp',
				installedAt: FIXED_TS,
			});
		});

		it('--json output contains all configured clients', async () => {
			await seedState(['cursor', 'claude-code', 'kiro']);
			await testRunCommand(AgentStatusCommand, { flags_json: true });

			const raw = logMessages.log.find((m) => m.startsWith('{'));
			const json = JSON.parse(raw!) as { clients: { client: string }[] };
			expect(json.clients.map((c) => c.client)).toEqual(expect.arrayContaining(['cursor', 'claude-code', 'kiro']));
		});
	});

	// ── --client flag ─────────────────────────────────────────────────────────

	describe('--client flag', () => {
		it('rejects unknown client with InvalidInput exit code', async () => {
			await testRunCommand(AgentStatusCommand, {
				flags_client: 'notaclient',
			});
			expect(process.exitCode).toBe(CommandExitCodes.InvalidInput);
		});

		it('shows status for only the targeted client', async () => {
			await seedState(['cursor', 'kiro']);
			await testRunCommand(AgentStatusCommand, {
				flags_client: 'cursor',
			});

			const out = logMessages.error.join('\n');
			expect(out).toMatch(/cursor/);
			expect(out).not.toMatch(/kiro/);
		});

		it('reports not-configured when --client targets an absent client', async () => {
			await seedState(['kiro']);
			await testRunCommand(AgentStatusCommand, {
				flags_client: 'cursor',
			});

			expect(process.exitCode).toBeUndefined();
			expect(logMessages.error.join('\n')).toMatch(/not configured/i);
		});

		it('--client with --json returns { clients: [] } when client is not configured', async () => {
			await seedState(['kiro']);
			await testRunCommand(AgentStatusCommand, {
				flags_client: 'cursor',
				flags_json: true,
			});

			const raw = logMessages.log.find((m) => m.startsWith('{'));
			expect(JSON.parse(raw!)).toEqual({ clients: [] });
		});

		it('--client with --json returns the matching entry when configured', async () => {
			await seedState(['cursor']);
			await testRunCommand(AgentStatusCommand, {
				flags_client: 'cursor',
				flags_json: true,
			});

			const raw = logMessages.log.find((m) => m.startsWith('{'));
			const json = JSON.parse(raw!) as { clients: { client: string }[] };
			expect(json.clients).toHaveLength(1);
			expect(json.clients[0].client).toBe('cursor');
		});
	});

	// ── Security ────────────────────────────────────────────────────────────────

	describe('security', () => {
		it('stdout does not contain any bearer token patterns', async () => {
			await writeFile(
				`${tmpPath}/.cursor/mcp.json`,
				JSON.stringify({
					mcpServers: {
						apify: {
							url: 'https://mcp.apify.com',
							headers: {
								Authorization: 'Bearer apify_api_SECRET',
							},
						},
					},
				}),
			).catch(() => undefined);
			await seedState(['cursor']);
			await testRunCommand(AgentStatusCommand, { flags_json: true });

			const allOutput = [...logMessages.log, ...logMessages.error].join('\n');
			expect(allOutput).not.toMatch(/apify_api_/i);
			expect(allOutput).not.toMatch(/Bearer /i);
		});
	});
});
