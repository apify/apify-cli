import { existsSync, readFileSync } from 'node:fs';

import axios from 'axios';
import type { MockInstance } from 'vitest';

import { AUTH_FILE_PATH } from '../../src/lib/consts.js';
import { TEST_USER_BAD_TOKEN, TEST_USER_TOKEN, testUserClient } from '../__setup__/config.js';
import { useAuthSetup, safeLogin } from '../__setup__/hooks/useAuthSetup.js';

vitest.setConfig({ restoreMocks: false });
useAuthSetup();

vitest.mock('open', () => ({
	default: (url: string) => console.error(`Open URL: ${url}`),
}));

const { LoginCommand } = await import('../../src/commands/login.js');
const { LogoutCommand } = await import('../../src/commands/logout.js');

describe('apify login and logout', () => {
	let spy: MockInstance<(typeof console)['error']>;

	beforeEach(() => {
		spy = vitest.spyOn(console, 'error');
	});

	it('should end with Error with bad token', async () => {
		await safeLogin(TEST_USER_BAD_TOKEN);

		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0][0]).to.include('Error:');
	});

	it('should work with correct token', async () => {
		await safeLogin(TEST_USER_TOKEN);

		const expectedUserInfo = Object.assign(await testUserClient.user('me').get(), {
			token: TEST_USER_TOKEN,
		}) as unknown as Record<string, string>;
		const userInfoFromConfig = JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf8'));

		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0][0]).to.include('Success:');

		// Omit currentBillingPeriod, It can change during tests

		const {
			currentBillingPeriod: _1,
			plan: _2,
			createdAt: _3,
			...expectedUserInfoWithoutFloatFields
		} = expectedUserInfo;

		const {
			currentBillingPeriod: _4,
			plan: _5,
			createdAt: _6,
			...userInfoFromConfigWithoutFloatFields
		} = userInfoFromConfig;

		expect(expectedUserInfoWithoutFloatFields).to.eql(userInfoFromConfigWithoutFloatFields);

		await LogoutCommand.run([], import.meta.url);
		const isGlobalConfig = existsSync(AUTH_FILE_PATH());

		expect(isGlobalConfig).to.be.eql(false);
	});

	it('have correctly setup server for interactive login', async () => {
		// eslint-disable-next-line no-restricted-syntax -- intentional test
		await LoginCommand.run(['-m', 'console'], import.meta.url);

		const consoleInfo = spy.mock.calls[0][1];
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

		const expectedUserInfo = Object.assign(await testUserClient.user('me').get(), {
			token: TEST_USER_TOKEN,
		}) as unknown as Record<string, string>;
		const userInfoFromConfig = JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf8'));

		expect(spy.mock.calls[2][0]).to.include('Success:');

		// Omit currentBillingPeriod, It can change during tests

		const {
			currentBillingPeriod: _1,
			plan: _2,
			createdAt: _3,
			...expectedUserInfoWithoutFloatFields
		} = expectedUserInfo;
		const {
			currentBillingPeriod: _4,
			plan: _5,
			createdAt: _6,
			...userInfoFromConfigWithoutFloatFields
		} = userInfoFromConfig;

		expect(expectedUserInfoWithoutFloatFields).to.eql(userInfoFromConfigWithoutFloatFields);
	});
});
