import { readFileSync } from 'node:fs';

import { InfoCommand } from '../../src/commands/info.js';
import { runCommand } from '../../src/lib/command-framework/apify-command.js';
import { AUTH_FILE_PATH } from '../../src/lib/consts.js';
import { safeLogin, useAuthSetup } from '../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../__setup__/hooks/useConsoleSpy.js';

useAuthSetup();

const { lastErrorMessage, logSpy } = useConsoleSpy();

describe('apify info', () => {
	it('should end with Error when not logged in', async () => {
		await runCommand(InfoCommand, {});

		expect(lastErrorMessage()).toMatch(/you are not logged in/i);
	});

	it('should work when logged in', async () => {
		const spy = vitest.spyOn(console, 'log');

		await safeLogin();
		await runCommand(InfoCommand, {});

		const userInfoFromConfig = JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf8'));

		const spy = logSpy();

		expect(spy).toHaveBeenCalledTimes(2);
		expect(spy.mock.calls[1][0]).to.include(userInfoFromConfig.id);
	});
});
