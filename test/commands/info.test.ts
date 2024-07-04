import { runCommand } from '@oclif/test';
import { loadJsonFileSync } from 'load-json-file';

import { InfoCommand } from '../../src/commands/info.js';
import { LoginCommand } from '../../src/commands/login.js';
import { AUTH_FILE_PATH } from '../../src/lib/consts.js';
import { TEST_USER_TOKEN } from '../__setup__/config.js';
import { useAuthSetup } from '../__setup__/hooks/useAuthSetup.js';

useAuthSetup();

describe('apify info', () => {
	it('should end with Error when not logged in', async () => {
		const { error } = await runCommand(['info'], import.meta.url);

		expect(error).toBeTruthy();
	});

	it('should work when logged in', async () => {
		const spy = vitest.spyOn(console, 'log');

		await LoginCommand.run(['--token', TEST_USER_TOKEN], import.meta.url);
		await InfoCommand.run([], import.meta.url);

		const userInfoFromConfig = loadJsonFileSync<{ id: string }>(AUTH_FILE_PATH());

		expect(spy).toHaveBeenCalledTimes(2);
		expect(spy.mock.calls[1][0]).to.include(userInfoFromConfig.id);
	});
});
