import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { detectClients } from '../../../../src/lib/agent/detection.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';

const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('agent-detection');

beforeAll(beforeAllCalls);
afterAll(afterAllCalls);

beforeEach(async () => {
	// Wipe state between tests so home-path checks start from a clean directory.
	await rm(tmpPath, { recursive: true, force: true });
	await mkdir(tmpPath, { recursive: true });
	// Redirect ~ so existsSync checks land in the isolated tmpPath.
	vitest.stubEnv('HOME', tmpPath);
	// Clear PATH so which() never finds a real binary on the developer's machine.
	vitest.stubEnv('PATH', '');
});

afterEach(() => {
	vitest.unstubAllEnvs();
});

describe('agent/detection — detectClients()', () => {
	it('returns [] when no env vars are set, PATH is empty, and ~ is empty', async () => {
		expect(await detectClients()).toEqual([]);
	});

	// ── Env-var detection ────────────────────────────────────────────────────

	describe('env-var detection', () => {
		it('CLAUDECODE → claude-code detected', async () => {
			vitest.stubEnv('CLAUDECODE', '1');
			expect(await detectClients()).toContain('claude-code');
		});

		it('CLAUDE_CODE_ENTRYPOINT → claude-code detected', async () => {
			vitest.stubEnv('CLAUDE_CODE_ENTRYPOINT', 'cli');
			expect(await detectClients()).toContain('claude-code');
		});

		it('CURSOR_AGENT → cursor detected', async () => {
			vitest.stubEnv('CURSOR_AGENT', '1');
			expect(await detectClients()).toContain('cursor');
		});

		it('CODEX_SANDBOX → codex detected', async () => {
			vitest.stubEnv('CODEX_SANDBOX', '1');
			expect(await detectClients()).toContain('codex');
		});

		it('CODEX_THREAD_ID → codex detected', async () => {
			vitest.stubEnv('CODEX_THREAD_ID', 'abc123');
			expect(await detectClients()).toContain('codex');
		});

		it('OPENCLAW_SHELL → antigravity detected', async () => {
			vitest.stubEnv('OPENCLAW_SHELL', '1');
			expect(await detectClients()).toContain('antigravity');
		});

		it('CLINE_ACTIVE → NOT detected (cline is not a supported catalog client)', async () => {
			vitest.stubEnv('CLINE_ACTIVE', '1');
			expect(await detectClients()).toEqual([]);
		});

		it('GEMINI_CLI → NOT detected (no catalog client maps to gemini_cli)', async () => {
			vitest.stubEnv('GEMINI_CLI', '1');
			expect(await detectClients()).toEqual([]);
		});

		it('OPENCODE → NOT detected (open_code not in catalog)', async () => {
			vitest.stubEnv('OPENCODE', '1');
			expect(await detectClients()).toEqual([]);
		});

		it('multiple env vars → multiple clients detected', async () => {
			vitest.stubEnv('CLAUDECODE', '1');
			vitest.stubEnv('CURSOR_AGENT', '1');
			vitest.stubEnv('CODEX_THREAD_ID', 'x');
			const detected = await detectClients();
			expect(detected).toContain('claude-code');
			expect(detected).toContain('cursor');
			expect(detected).toContain('codex');
		});
	});

	// ── Home-path detection ──────────────────────────────────────────────────

	describe('home-path detection', () => {
		it('~/.claude exists → claude-code detected', async () => {
			await mkdir(joinPath('.claude'), { recursive: true });
			expect(await detectClients()).toContain('claude-code');
		});

		it('~/.cursor/mcp.json exists → cursor detected', async () => {
			await mkdir(joinPath('.cursor'), { recursive: true });
			await writeFile(joinPath('.cursor', 'mcp.json'), '{}', 'utf-8');
			expect(await detectClients()).toContain('cursor');
		});

		it('~/.cursor dir without mcp.json → cursor NOT detected', async () => {
			// Detection requires the mcp.json file specifically, not just the .cursor dir.
			await mkdir(joinPath('.cursor'), { recursive: true });
			expect(await detectClients()).not.toContain('cursor');
		});

		it('~/.vscode exists → vscode detected', async () => {
			await mkdir(joinPath('.vscode'), { recursive: true });
			expect(await detectClients()).toContain('vscode');
		});

		it('~/.vscode-insiders exists → vscode-insiders detected', async () => {
			await mkdir(joinPath('.vscode-insiders'), { recursive: true });
			expect(await detectClients()).toContain('vscode-insiders');
		});

		it('~/.kiro exists → kiro detected', async () => {
			await mkdir(joinPath('.kiro'), { recursive: true });
			expect(await detectClients()).toContain('kiro');
		});

		it('~/.gemini/antigravity exists → antigravity detected', async () => {
			await mkdir(joinPath('.gemini', 'antigravity'), { recursive: true });
			expect(await detectClients()).toContain('antigravity');
		});

		it('~/.gemini exists without antigravity subdir → antigravity NOT detected', async () => {
			await mkdir(joinPath('.gemini'), { recursive: true });
			expect(await detectClients()).not.toContain('antigravity');
		});

		it('multiple home paths → multiple clients detected simultaneously', async () => {
			await mkdir(joinPath('.claude'), { recursive: true });
			await mkdir(joinPath('.kiro'), { recursive: true });
			const detected = await detectClients();
			expect(detected).toContain('claude-code');
			expect(detected).toContain('kiro');
		});
	});

	// ── Ordering and deduplication ────────────────────────────────────────────

	describe('ordering', () => {
		it('env-detected client appears before home-path-only client', async () => {
			vitest.stubEnv('CLAUDECODE', '1'); // claude-code via env
			// cursor detected via home path only
			await mkdir(joinPath('.cursor'), { recursive: true });
			await writeFile(joinPath('.cursor', 'mcp.json'), '{}', 'utf-8');

			const detected = await detectClients();
			expect(detected.indexOf('claude-code')).toBeLessThan(detected.indexOf('cursor'));
		});

		it('a client detected by both env and home path appears exactly once', async () => {
			vitest.stubEnv('CURSOR_AGENT', '1');
			await mkdir(joinPath('.cursor'), { recursive: true });
			await writeFile(joinPath('.cursor', 'mcp.json'), '{}', 'utf-8');

			const detected = await detectClients();
			expect(detected.filter((c) => c === 'cursor')).toHaveLength(1);
		});

		it('result contains no duplicate entries across any combination of signals', async () => {
			vitest.stubEnv('CLAUDECODE', '1');
			vitest.stubEnv('CLAUDE_CODE_ENTRYPOINT', 'cli'); // second signal for same client
			await mkdir(joinPath('.claude'), { recursive: true }); // third signal for same client

			const detected = await detectClients();
			expect(detected.filter((c) => c === 'claude-code')).toHaveLength(1);
		});
	});
});
