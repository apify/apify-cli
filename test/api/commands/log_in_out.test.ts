import { existsSync } from 'node:fs';

import axios from 'axios';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { AUTH_FILE_PATH } from '../../../src/lib/consts.js';
import { getToken } from '../../../src/lib/credentials.js';
import { readActiveProfile } from '../../__setup__/auth-file.js';
import { TEST_USER_BAD_TOKEN, TEST_USER_TOKEN, testUserClient } from '../../__setup__/config.js';
import { safeLogin, useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

vitest.setConfig({ restoreMocks: false });
useAuthSetup();

vitest.mock('open', () => ({
	default: (url: string) => console.log(`Open URL: ${url}`),
}));

const { lastErrorMessage, errorSpy } = useConsoleSpy();

const { LoginCommand } = await import('../../../src/commands/login.js');
const { LogoutCommand } = await import('../../../src/commands/logout.js');

describe('[api] apify login and logout', () => {
	it('should end with Error with bad token', async () => {
		await safeLogin(TEST_USER_BAD_TOKEN);

		expect(errorSpy()).toHaveBeenCalledTimes(1);
		expect(lastErrorMessage()).to.include('Error:');
	});

	it('should work with correct token', async () => {
		await safeLogin(TEST_USER_TOKEN);

		const expectedUserInfo = await testUserClient.user('me').get();

		expect(lastErrorMessage()).to.include('Success:');

		expect(readActiveProfile()).toMatchObject({
			id: expectedUserInfo.id,
			username: expectedUserInfo.username,
		});
		expect(await getToken()).to.eql(TEST_USER_TOKEN);

		await testRunCommand(LogoutCommand, {});
		const isGlobalConfig = existsSync(AUTH_FILE_PATH());

		expect(isGlobalConfig).to.be.eql(false);
	});

	it('have correctly setup server for interactive login', async () => {
		// eslint-disable-next-line no-restricted-syntax -- Intentionally testing a different login method
		await testRunCommand(LoginCommand, { flags_method: 'console' });

		const consoleInfo = lastErrorMessage();
		const consoleUrl = /"(http[s]?:\/\/[^"]*)"/.exec(consoleInfo)?.[1];

		const consoleUrlParams = new URL(consoleUrl!).searchParams;

		const localCliPort = consoleUrlParams.get('localCliPort');
		const localCliToken = consoleUrlParams.get('localCliToken');

		const response = await axios.post(
			`http://localhost:${localCliPort}/api/v1/login-token?token=${localCliToken}`,
			{ apiToken: TEST_USER_TOKEN },
			{ headers: { 'Content-Type': 'application/json' } },
		);

		expect(response.status).to.be.eql(200);

		const expectedUserInfo = await testUserClient.user('me').get();

		expect(lastErrorMessage()).to.include('Success:');

		expect(readActiveProfile()).toMatchObject({
			id: expectedUserInfo.id,
			username: expectedUserInfo.username,
		});
		expect(await getToken()).to.eql(TEST_USER_TOKEN);
	});
});
