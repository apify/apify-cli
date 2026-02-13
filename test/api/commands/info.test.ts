import { readFileSync } from 'node:fs';

import { InfoCommand } from '../../../src/commands/info.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { AUTH_FILE_PATH } from '../../../src/lib/consts.js';
import { safeLogin, useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

useAuthSetup();

const { logSpy } = useConsoleSpy();

describe('[api] apify info', () => {
	it('should end with Error when not logged in', async () => {
		await expect(testRunCommand(InfoCommand, {})).rejects.toThrow(/you are not logged in/i);
	});

	it('should work when logged in', async () => {
		await safeLogin();
		await testRunCommand(InfoCommand, {});

		const userInfoFromConfig = JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf8'));

		const spy = logSpy();

		expect(spy).toHaveBeenCalledTimes(2);
		expect(spy.mock.calls[1][0]).to.include(userInfoFromConfig.id);
	});
});
