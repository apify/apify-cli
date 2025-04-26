import { readFileSync } from 'node:fs';

import { runCommand } from '@oclif/test';

import { InfoCommand } from '../../src/commands/info.js';
import { AUTH_FILE_PATH } from '../../src/lib/consts.js';
import { useAuthSetup, safeLogin } from '../__setup__/hooks/useAuthSetup.js';

useAuthSetup();

describe('apify info', () => {
	it('should end with Error when not logged in', async () => {
		const { error } = await runCommand(['info'], import.meta.url);

		expect(error).toBeTruthy();
	});

	it('should work when logged in', async () => {
		const spy = vitest.spyOn(console, 'log');

		await safeLogin();
		await InfoCommand.run([], import.meta.url);

		const userInfoFromConfig = JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf8'));

		expect(spy).toHaveBeenCalledTimes(2);
		expect(spy.mock.calls[1][0]).to.include(userInfoFromConfig.id);
	});
});
