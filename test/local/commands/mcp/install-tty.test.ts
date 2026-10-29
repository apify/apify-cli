import { mkdir, readFile, rm } from 'node:fs/promises';
import process from 'node:process';

const { stdinState, confirmImpl } = vitest.hoisted(() => ({
	stdinState: { isTTY: true, hasData: false },
	confirmImpl: vitest.fn(async () => false),
}));

// The sibling install.test.ts pins `isCI: true` for its whole file, which hides the interactive
// branch. This file pins the opposite and fakes a TTY so the overwrite prompt is actually reachable.
vitest.mock('ci-info', async (importOriginal) => {
	const original = await importOriginal<typeof import('ci-info')>();
	return { ...original, isCI: false };
});

vitest.mock('../../../../src/lib/hooks/useStdin.js', () => ({
	useStdin: async () => ({ ...stdinState, waitDelay: 0, stream: process.stdin }),
}));

vitest.mock('../../../../src/lib/utils/inquirer/confirmImpl.js', () => ({ confirmImpl }));

import { MCPInstallCommand } from '../../../../src/commands/mcp/install.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { useAuthSetup } from '../../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';

const TEST_TOKEN = 'apify_api_TEST_xxxxxxxxxxxxxxxxxxxxxx';
const OTHER_TEST_TOKEN = 'apify_api_OTHER_yyyyyyyyyyyyyyyyyyyy';

const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('mcp-install-tty');

useAuthSetup();

useConsoleSpy();

beforeAll(beforeAllCalls);
afterAll(afterAllCalls);

beforeEach(async () => {
	await rm(tmpPath, { recursive: true, force: true });
	await mkdir(tmpPath, { recursive: true });
	vitest.stubEnv('HOME', tmpPath);
	vitest.stubEnv('PATH', '');
	vitest.stubEnv('APIFY_TOKEN', '');
	confirmImpl.mockClear();
});

afterEach(() => {
	process.exitCode = undefined;
});

async function installedToken() {
	const config = JSON.parse(await readFile(joinPath('.cursor', 'mcp.json'), 'utf-8')) as {
		mcpServers: { apify: { headers: { Authorization: string } } };
	};

	return config.mcpServers.apify.headers.Authorization;
}

describe('apify mcp install on a TTY', () => {
	it('cursor: --yes overwrites without showing the prompt', async () => {
		await testRunCommand(MCPInstallCommand, { args_client: 'cursor', flags_token: TEST_TOKEN });
		await testRunCommand(MCPInstallCommand, { args_client: 'cursor', flags_token: OTHER_TEST_TOKEN, flags_yes: true });

		expect(confirmImpl).not.toHaveBeenCalled();
		expect(process.exitCode).toBeUndefined();
		expect(await installedToken()).toBe(`Bearer ${OTHER_TEST_TOKEN}`);
	});

	it('cursor: without --yes the prompt is shown and declining keeps the existing entry', async () => {
		await testRunCommand(MCPInstallCommand, { args_client: 'cursor', flags_token: TEST_TOKEN });
		await testRunCommand(MCPInstallCommand, { args_client: 'cursor', flags_token: OTHER_TEST_TOKEN });

		expect(confirmImpl).toHaveBeenCalledOnce();
		expect(await installedToken()).toBe(`Bearer ${TEST_TOKEN}`);
	});
});
