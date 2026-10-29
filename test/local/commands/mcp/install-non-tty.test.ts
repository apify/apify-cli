import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';

// Deliberately NOT mocking `isCI`: a Docker build or a cron job is non-interactive without being
// CI, and `useStdin` reports `hasData` for such a stdin, so the expiry prompt used to hang there.
vitest.mock('ci-info', async (importOriginal) => {
	const original = await importOriginal<typeof import('ci-info')>();
	return { ...original, isCI: false };
});

import { MCPInstallCommand } from '../../../../src/commands/mcp/install.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { AUTH_FILE_PATH, CommandExitCodes, GLOBAL_CONFIGS_FOLDER } from '../../../../src/lib/consts.js';
import { setSecret } from '../../../../src/lib/credentials.js';
import { TEST_USER_ID, v2AuthFile } from '../../../__setup__/auth-file.js';
import { useAuthSetup } from '../../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';

const STORED_TOKEN = 'apify_api_STORED_zzzzzzzzzzzzzzzzzzzz';

const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('mcp-install-non-tty');

useAuthSetup();

const { logMessages } = useConsoleSpy();

beforeAll(beforeAllCalls);
afterAll(afterAllCalls);

beforeEach(async () => {
	vitest.stubEnv('HOME', tmpPath);
	vitest.stubEnv('APIFY_TOKEN', '');

	await mkdir(GLOBAL_CONFIGS_FOLDER(), { recursive: true });
	await writeFile(
		AUTH_FILE_PATH(),
		JSON.stringify(
			v2AuthFile({
				authMethod: 'oauth2',
				expiresAt: new Date(Date.now() + 50 * 60_000).toISOString(),
				hasRefreshToken: true,
				oauth: {
					issuer: 'https://issuer.test',
					clientId: 'https://client.test/oauth-client.json',
					tokenEndpoint: 'https://issuer.test/oauth/apps/token',
					refreshTokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60_000).toISOString(),
				},
			}),
		),
		'utf-8',
	);
	await setSecret(TEST_USER_ID, 'token', STORED_TOKEN);
});

afterEach(() => {
	process.exitCode = undefined;
});

describe('apify mcp install, non-interactive but not CI', () => {
	it('fails with the --token hint instead of waiting on a prompt nobody can answer', async () => {
		await testRunCommand(MCPInstallCommand, { args_client: 'cursor' });

		expect(process.exitCode).toBe(CommandExitCodes.InvalidInput);
		expect(logMessages.error.join('\n')).toMatch(/--token <api-token>/);
		expect(existsSync(joinPath('.cursor', 'mcp.json'))).toBe(false);
	});

	it('--yes writes the config without prompting', async () => {
		await testRunCommand(MCPInstallCommand, { args_client: 'cursor', flags_yes: true });

		expect(process.exitCode).toBeUndefined();
		expect(existsSync(joinPath('.cursor', 'mcp.json'))).toBe(true);
	});
});
