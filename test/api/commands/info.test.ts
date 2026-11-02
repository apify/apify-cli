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

		const rows = logSpy().mock.calls.map(([row]) => String(row));
		const row = (label: string) => rows.find((r) => r.includes(label));

		expect(row('userId')).toContain(readActiveProfile()!.id);
		expect(row('token source')).toContain('apify login');
	});
});
