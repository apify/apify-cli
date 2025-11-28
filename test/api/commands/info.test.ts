import { InfoCommand } from '../../../src/commands/info.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { getLocalUserInfo } from '../../../src/lib/utils.js';
import { safeLogin, useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

useAuthSetup();

const { lastErrorMessage, logSpy } = useConsoleSpy();

describe('[api] apify info', () => {
	it('should end with Error when not logged in', async () => {
		await testRunCommand(InfoCommand, {});

		expect(lastErrorMessage()).toMatch(/you are not logged in/i);
	});

	it('should work when logged in', async () => {
		await safeLogin();
		await testRunCommand(InfoCommand, {});

		const userInfoFromConfig = await getLocalUserInfo();

		const spy = logSpy();

		expect(spy).toHaveBeenCalledTimes(2);
		expect(spy.mock.calls[1][0]).to.include(userInfoFromConfig.id);
	});
});
