import { InfoCommand } from '../../../src/commands/info.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { readActiveProfile } from '../../__setup__/auth-file.js';
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

		const spy = logSpy();

		expect(spy).toHaveBeenCalledTimes(3);
		expect(spy.mock.calls[1][0]).to.include(readActiveProfile()!.id);
		expect(spy.mock.calls[2][0]).to.include('apify login');
	});
});
