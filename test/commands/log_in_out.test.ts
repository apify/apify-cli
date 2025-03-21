import { existsSync } from 'node:fs';

import axios from 'axios';
import { loadJsonFileSync } from 'load-json-file';
import _ from 'underscore';

import { runCommand } from '../../src/lib/command-framework/apify-command.js';
import { AUTH_FILE_PATH } from '../../src/lib/consts.js';
import { TEST_USER_BAD_TOKEN, TEST_USER_TOKEN, testUserClient } from '../__setup__/config.js';
import { useAuthSetup } from '../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../__setup__/hooks/useConsoleSpy.js';

vitest.setConfig({ restoreMocks: false });
useAuthSetup();

vitest.mock('open', () => ({
	default: (url: string) => console.log(`Open URL: ${url}`),
}));

const { lastErrorMessage, errorSpy } = useConsoleSpy();

const { LoginCommand } = await import('../../src/commands/login.js');
const { LogoutCommand } = await import('../../src/commands/logout.js');

describe('apify login and logout', () => {
	it('should end with Error with bad token', async () => {
		await runCommand(LoginCommand, {
			flags_token: TEST_USER_BAD_TOKEN,
		});

		expect(errorSpy()).toHaveBeenCalledTimes(1);
		expect(lastErrorMessage()).to.include('Error:');
	});

	it('should work with correct token', async () => {
		await runCommand(LoginCommand, { flags_token: TEST_USER_TOKEN });

		const expectedUserInfo = Object.assign(await testUserClient.user('me').get(), { token: TEST_USER_TOKEN });
		const userInfoFromConfig = loadJsonFileSync(AUTH_FILE_PATH());

		expect(errorSpy()).toHaveBeenCalledTimes(1);
		expect(lastErrorMessage()).to.include('Success:');
		// Omit currentBillingPeriod, It can change during tests
		const floatFields = ['currentBillingPeriod', 'plan', 'createdAt'];
		expect(_.omit(expectedUserInfo, floatFields)).to.eql(_.omit(userInfoFromConfig, floatFields));

		await runCommand(LogoutCommand, {});
		const isGlobalConfig = existsSync(AUTH_FILE_PATH());

		expect(isGlobalConfig).to.be.eql(false);
	});

	it('have correctly setup server for interactive login', async () => {
		await runCommand(LoginCommand, { flags_method: 'console' });

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

		const expectedUserInfo = Object.assign(await testUserClient.user('me').get(), { token: TEST_USER_TOKEN });
		const userInfoFromConfig = loadJsonFileSync(AUTH_FILE_PATH());

		expect(lastErrorMessage()).to.include('Success:');
		// Omit currentBillingPeriod, It can change during tests
		const floatFields = ['currentBillingPeriod', 'plan', 'createdAt'];
		expect(_.omit(expectedUserInfo, floatFields)).to.eql(_.omit(userInfoFromConfig, floatFields));
	});
});
