import { EOL } from 'node:os';

import { ApifyClient } from 'apify-client';
import isCI from 'is-ci';

import { getLoggedClient } from '../../src/lib/authFile.js';

const { TEST_USER_TOKEN: ENV_TEST_USER_TOKEN } = process.env;

export const TEST_USER_BAD_TOKEN = 'badToken';

if (!ENV_TEST_USER_TOKEN) {
	throw Error('You must configure "TEST_USER_TOKEN" environment variable to run tests!');
}

export const testUserClient = getLoggedClient({ token: ENV_TEST_USER_TOKEN, baseUrl: undefined });

export const badUserClient = new ApifyClient({ token: TEST_USER_BAD_TOKEN, baseUrl: undefined });

export const TEST_USER_TOKEN = ENV_TEST_USER_TOKEN;

if (isCI) {
	process.stdout.write(`CI environment detected, masking secrets as they are created${EOL}`);
	process.stdout.write(`${EOL}::add-mask::${TEST_USER_TOKEN}${EOL}`);
}
