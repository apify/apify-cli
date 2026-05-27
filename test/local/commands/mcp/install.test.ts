import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import process from 'node:process';

// Force `useYesNoConfirm` down its non-interactive path so the overwrite prompt errors out
// instead of blocking the test on stdin. See src/lib/hooks/user-confirmations/_stdinCheckWrapper.ts.
vitest.mock('is-ci', () => ({ default: true }));

import { MCPInstallCommand } from '../../../../src/commands/mcp/install.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { CommandExitCodes } from '../../../../src/lib/consts.js';
import { cursorMcpJsoncWithCommentsPath } from '../../../__setup__/fixtures/mcp-install-fixtures.js';
import { useAuthSetup } from '../../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';

const TEST_TOKEN = 'apify_api_TEST_xxxxxxxxxxxxxxxxxxxxxx';
const OTHER_TEST_TOKEN = 'apify_api_OTHER_yyyyyyyyyyyyyyyyyyyy';

const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('mcp-install');

useAuthSetup();

const { logMessages } = useConsoleSpy();

async function readJson(path: string): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(path, 'utf-8'));
}

beforeAll(beforeAllCalls);
afterAll(afterAllCalls);

beforeEach(async () => {
	// Wipe leftovers from previous tests so each install starts from a clean HOME.
	await rm(tmpPath, { recursive: true, force: true });
	await mkdir(tmpPath, { recursive: true });
	// Route every userHomeDir() lookup into the per-suite tmp dir.
	vitest.stubEnv('HOME', tmpPath);
	// PATH='' guarantees `which('claude'|'codex')` returns null even on dev machines that have those installed.
	vitest.stubEnv('PATH', '');
	vitest.stubEnv('APIFY_TOKEN', '');
});

// useAuthSetup() already calls vitest.unstubAllEnvs() in its own afterEach. Calling it again
// here races with useAuthSetup's cleanup — if our afterEach runs first, HOME is restored to
// the real value before useAuthSetup computes GLOBAL_CONFIGS_FOLDER() and rm()s it, wiping
// the developer's real ~/.apify (auth.json, secrets.json, telemetry).
afterEach(() => {
	process.exitCode = undefined;
});

describe('apify mcp install', () => {
	it('rejects an unknown client name with InvalidInput exit code', async () => {
		await testRunCommand(MCPInstallCommand, { args_client: 'foo', flags_token: TEST_TOKEN });

		expect(process.exitCode).toBe(CommandExitCodes.InvalidInput);
		const stderr = logMessages.error.join('\n');
		expect(stderr).toMatch(/Unknown MCP client 'foo'/);
		for (const client of ['claude-code', 'cursor', 'vscode', 'vscode-insiders', 'codex', 'kiro', 'antigravity']) {
			expect(stderr).toContain(client);
		}
	});

	it('errors when no token is available anywhere', async () => {
		await testRunCommand(MCPInstallCommand, { args_client: 'cursor' });

		expect(process.exitCode).toBe(CommandExitCodes.MissingAuth);
		expect(logMessages.error.join('\n')).toMatch(/not logged in to Apify.*apify login.*--token/s);
	});

	it('cursor: writes mcp.json from --token', async () => {
		await testRunCommand(MCPInstallCommand, { args_client: 'cursor', flags_token: TEST_TOKEN });

		const config = await readJson(joinPath('.cursor', 'mcp.json'));
		expect(config).toEqual({
			mcpServers: {
				apify: {
					url: 'https://mcp.apify.com',
					headers: { Authorization: `Bearer ${TEST_TOKEN}` },
				},
			},
		});
	});

	it('cursor: re-run without --yes in non-TTY exits with "Re-run with --yes"', async () => {
		await testRunCommand(MCPInstallCommand, { args_client: 'cursor', flags_token: TEST_TOKEN });
		expect(process.exitCode).toBeUndefined();

		await testRunCommand(MCPInstallCommand, { args_client: 'cursor', flags_token: OTHER_TEST_TOKEN });

		expect(process.exitCode).toBe(1);
		expect(logMessages.error.join('\n')).toMatch(/already exists.*Re-run with --yes/s);

		// Original token preserved.
		const config = await readJson(joinPath('.cursor', 'mcp.json'));
		expect((config.mcpServers as { apify: { headers: { Authorization: string } } }).apify.headers.Authorization).toBe(
			`Bearer ${TEST_TOKEN}`,
		);
	});

	it('cursor: re-run with --yes overwrites the existing entry', async () => {
		await testRunCommand(MCPInstallCommand, { args_client: 'cursor', flags_token: TEST_TOKEN });
		await testRunCommand(MCPInstallCommand, { args_client: 'cursor', flags_token: OTHER_TEST_TOKEN, flags_yes: true });

		expect(process.exitCode).toBeUndefined();
		const config = await readJson(joinPath('.cursor', 'mcp.json'));
		expect((config.mcpServers as { apify: { headers: { Authorization: string } } }).apify.headers.Authorization).toBe(
			`Bearer ${OTHER_TEST_TOKEN}`,
		);
	});

	it('cursor: --tools is appended to the URL as a ?tools= query string', async () => {
		await testRunCommand(MCPInstallCommand, {
			args_client: 'cursor',
			flags_token: TEST_TOKEN,
			flags_tools: 'search-actors,apify/rag-web-browser',
		});

		const config = await readJson(joinPath('.cursor', 'mcp.json'));
		expect((config.mcpServers as { apify: { url: string } }).apify.url).toBe(
			'https://mcp.apify.com?tools=search-actors,apify/rag-web-browser',
		);
	});

	it('cursor: preserves comments and other servers when re-installing (JSONC round-trip)', async () => {
		// Pre-seed a hand-edited config with comments, a trailing comma, and an unrelated server.
		const cursorPath = joinPath('.cursor', 'mcp.json');
		await mkdir(joinPath('.cursor'), { recursive: true });
		await writeFile(cursorPath, await readFile(cursorMcpJsoncWithCommentsPath, 'utf-8'), 'utf-8');

		await testRunCommand(MCPInstallCommand, { args_client: 'cursor', flags_token: TEST_TOKEN });

		const updated = await readFile(cursorPath, 'utf-8');
		expect(updated).toContain('// User-added top-of-file comment');
		expect(updated).toContain('// PAT expires 2026-01');
		expect(updated).toContain('github_pat_XYZ');
		expect(updated).toContain(`Bearer ${TEST_TOKEN}`);
	});

	it('cursor: falls back to APIFY_TOKEN env when no --token is given', async () => {
		vitest.stubEnv('APIFY_TOKEN', OTHER_TEST_TOKEN);

		await testRunCommand(MCPInstallCommand, { args_client: 'cursor' });

		const config = await readJson(joinPath('.cursor', 'mcp.json'));
		expect((config.mcpServers as { apify: { headers: { Authorization: string } } }).apify.headers.Authorization).toBe(
			`Bearer ${OTHER_TEST_TOKEN}`,
		);
	});

	it('antigravity: writes serverUrl (not url)', async () => {
		await testRunCommand(MCPInstallCommand, { args_client: 'antigravity', flags_token: TEST_TOKEN });

		const config = await readJson(joinPath('.gemini', 'antigravity', 'mcp_config.json'));
		const entry = (config.mcpServers as { apify: Record<string, unknown> }).apify;
		expect(entry).toHaveProperty('serverUrl', 'https://mcp.apify.com');
		expect(entry).not.toHaveProperty('url');
	});

	// vscode and vscode-insiders shell out to '<bin> --add-mcp <json>'; with PATH='' the binary is missing.
	describe.each([
		{ client: 'vscode', binary: 'code', label: 'VS Code' },
		{ client: 'vscode-insiders', binary: 'code-insiders', label: 'VS Code Insiders' },
	])(
		'$client: friendly error with copy-pastable command (no token leak) when binary is not on PATH',
		({ client, binary, label }) => {
			it('emits the right snippet and exits with NotFound', async () => {
				await testRunCommand(MCPInstallCommand, { args_client: client, flags_token: TEST_TOKEN });

				expect(process.exitCode).toBe(CommandExitCodes.NotFound);
				const stderr = logMessages.error.join('\n');
				expect(stderr).toContain(`'${binary}' CLI was not found on PATH`);
				expect(stderr).toContain(`Install ${label}`);
				expect(stderr).toContain(`${binary} --add-mcp '`);
				expect(stderr).toContain('"Authorization":"Bearer <your-token>"');
				expect(stderr).not.toContain(TEST_TOKEN);
			});
		},
	);

	it('claude-code: emits a friendly error with a copy-pastable command (no token leak) when claude is not on PATH', async () => {
		await testRunCommand(MCPInstallCommand, { args_client: 'claude-code', flags_token: TEST_TOKEN });

		expect(process.exitCode).toBe(CommandExitCodes.NotFound);
		const stderr = logMessages.error.join('\n');
		expect(stderr).toMatch(/'claude' CLI was not found on PATH/);
		// Manual fallback uses a <your-token> placeholder — we never print the actual token to the terminal.
		expect(stderr).toContain(
			'claude mcp add --transport http --scope user apify "https://mcp.apify.com" --header "Authorization: Bearer <your-token>"',
		);
		expect(stderr).not.toContain(TEST_TOKEN);
	});

	it('codex: emits a friendly error with the TOML snippet (no token leak) when codex is not on PATH', async () => {
		await testRunCommand(MCPInstallCommand, { args_client: 'codex', flags_token: TEST_TOKEN });

		expect(process.exitCode).toBe(CommandExitCodes.NotFound);
		const stderr = logMessages.error.join('\n');
		expect(stderr).toMatch(/'codex' CLI was not found on PATH/);
		expect(stderr).toContain('[mcp_servers.apify]');
		expect(stderr).toContain('url = "https://mcp.apify.com"');
		expect(stderr).toContain('bearer_token_env_var = "APIFY_TOKEN"');
		expect(stderr).toContain('export APIFY_TOKEN=<your-token>');
		expect(stderr).not.toContain(TEST_TOKEN);
	});
});
