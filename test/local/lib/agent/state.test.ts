import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import {
	isClientConfigured,
	readAgentState,
	writeAgentState,
	type AgentState,
} from '../../../../src/lib/agent/state.js';
import { AGENT_STATE_FILE_PATH } from '../../../../src/lib/consts.js';
import { useAuthSetup } from '../../../__setup__/hooks/useAuthSetup.js';

// useAuthSetup redirects GLOBAL_CONFIGS_FOLDER (and therefore AGENT_STATE_FILE_PATH) to
// a per-test isolated path under ~/.apify/<random>/, keeping state tests hermetic.
useAuthSetup();

const FIXED_TS = '2026-01-01T00:00:00.000Z';

describe('agent/state', () => {
	// ── readAgentState() ─────────────────────────────────────────────────────

	describe('readAgentState()', () => {
		it('returns null when the state file does not exist', async () => {
			expect(await readAgentState()).toBeNull();
		});

		it('returns null on malformed JSON without throwing', async () => {
			const { mkdir, writeFile } = await import('node:fs/promises');
			const { dirname } = await import('node:path');
			const path = AGENT_STATE_FILE_PATH();
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, '{ invalid json ::: }', 'utf-8');

			expect(await readAgentState()).toBeNull();
		});

		it('returns null on empty file without throwing', async () => {
			const { mkdir, writeFile } = await import('node:fs/promises');
			const { dirname } = await import('node:path');
			const path = AGENT_STATE_FILE_PATH();
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, '', 'utf-8');

			expect(await readAgentState()).toBeNull();
		});
	});

	// ── writeAgentState() round-trip ──────────────────────────────────────────

	describe('writeAgentState()', () => {
		it('round-trips through readAgentState() with no loss', async () => {
			const state: AgentState = {
				installedAt: FIXED_TS,
				clients: [
					{
						client: 'claude-code',
						tier: 'mcp',
						installedAt: FIXED_TS,
					},
					{ client: 'cursor', tier: 'mcp', installedAt: FIXED_TS },
				],
			};
			await writeAgentState(state);
			expect(await readAgentState()).toEqual(state);
		});

		it('writes the spec-compliant JSON structure to disk', async () => {
			const state: AgentState = {
				installedAt: FIXED_TS,
				clients: [{ client: 'cursor', tier: 'mcp', installedAt: FIXED_TS }],
			};

			await writeAgentState(state);

			const raw = JSON.parse(await readFile(AGENT_STATE_FILE_PATH(), 'utf-8')) as unknown;
			expect(raw).toEqual({
				installedAt: FIXED_TS,
				clients: [{ client: 'cursor', tier: 'mcp', installedAt: FIXED_TS }],
			});
		});

		it('state file ends with a newline', async () => {
			await writeAgentState({ installedAt: FIXED_TS, clients: [] });
			const raw = await readFile(AGENT_STATE_FILE_PATH(), 'utf-8');
			expect(raw.endsWith('\n')).toBe(true);
		});

		it('creates parent directories when they do not exist', async () => {
			// useAuthSetup redirects to a new path per test — no directory yet.
			await expect(writeAgentState({ installedAt: FIXED_TS, clients: [] })).resolves.toBeUndefined();
			expect(existsSync(AGENT_STATE_FILE_PATH())).toBe(true);
		});

		it('leaves no .tmp file behind after a successful write', async () => {
			await writeAgentState({ installedAt: FIXED_TS, clients: [] });
			const tmpPath = `${AGENT_STATE_FILE_PATH()}.${process.pid}.tmp`;
			expect(existsSync(tmpPath)).toBe(false);
		});

		it('overwrites an existing state file on re-write', async () => {
			const v1: AgentState = {
				installedAt: FIXED_TS,
				clients: [{ client: 'cursor', tier: 'mcp', installedAt: FIXED_TS }],
			};
			const v2: AgentState = {
				installedAt: FIXED_TS,
				clients: [
					{ client: 'cursor', tier: 'mcp', installedAt: FIXED_TS },
					{ client: 'kiro', tier: 'mcp', installedAt: FIXED_TS },
				],
			};

			await writeAgentState(v1);
			await writeAgentState(v2);

			expect(await readAgentState()).toEqual(v2);
		});

		it('state file does NOT contain API tokens (security)', async () => {
			const state: AgentState = {
				installedAt: FIXED_TS,
				clients: [{ client: 'cursor', tier: 'mcp', installedAt: FIXED_TS }],
			};
			await writeAgentState(state);

			const raw = await readFile(AGENT_STATE_FILE_PATH(), 'utf-8');
			// There should be no token-like value (apify_api_ prefix) in the state file.
			expect(raw).not.toMatch(/apify_api_/i);
			expect(raw).not.toMatch(/Bearer /i);
		});
	});

	// ── isClientConfigured() ─────────────────────────────────────────────────

	describe('isClientConfigured()', () => {
		it('returns true when the client is present in the clients array', () => {
			const state: AgentState = {
				installedAt: FIXED_TS,
				clients: [
					{
						client: 'claude-code',
						tier: 'mcp',
						installedAt: FIXED_TS,
					},
				],
			};
			expect(isClientConfigured(state, 'claude-code')).toBe(true);
		});

		it('returns false when the client is absent from the clients array', () => {
			const state: AgentState = {
				installedAt: FIXED_TS,
				clients: [{ client: 'cursor', tier: 'mcp', installedAt: FIXED_TS }],
			};
			expect(isClientConfigured(state, 'claude-code')).toBe(false);
		});

		it('returns false for an empty clients array', () => {
			expect(isClientConfigured({ installedAt: FIXED_TS, clients: [] }, 'cursor')).toBe(false);
		});

		it('is case-sensitive (client keys are always lower-kebab)', () => {
			const state: AgentState = {
				installedAt: FIXED_TS,
				clients: [
					{
						client: 'claude-code',
						tier: 'mcp',
						installedAt: FIXED_TS,
					},
				],
			};
			expect(isClientConfigured(state, 'Claude-Code')).toBe(false);
			expect(isClientConfigured(state, 'CLAUDE-CODE')).toBe(false);
		});
	});
});
