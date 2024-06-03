import { runCommand } from '@oclif/test';

import { SecretRmCommand } from '../../../src/commands/secrets/rm.js';
import { getSecretsFile } from '../../../src/lib/secrets.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';

const SECRET_KEY = 'mySecret';
const SECRET_KEY_2 = 'mySecret2';
const SECRET_VALUE = 'mySecretValue';

useAuthSetup({ perTest: false });

describe('apify secrets:add', () => {
	beforeAll(async () => {
		const secrets = getSecretsFile();
		if (secrets[SECRET_KEY]) {
			await SecretRmCommand.run([SECRET_KEY], import.meta.url);
		}
	});

	it('should work', async () => {
		const { error } = await runCommand(['secrets:add', SECRET_KEY, SECRET_VALUE], import.meta.url);

		expect(error).toBeFalsy();

		const secrets = getSecretsFile();
		expect(secrets[SECRET_KEY]).to.eql(SECRET_VALUE);
	});

	it('should work with alias', async () => {
		const { error } = await runCommand(['secrets add', SECRET_KEY_2, SECRET_VALUE], import.meta.url);

		expect(error).toBeFalsy();

		const secrets = getSecretsFile();
		expect(secrets[SECRET_KEY_2]).to.eql(SECRET_VALUE);
	});

	afterAll(async () => {
		const secrets = getSecretsFile();

		if (secrets[SECRET_KEY]) {
			await SecretRmCommand.run([SECRET_KEY], import.meta.url);
		}

		if (secrets[SECRET_KEY_2]) {
			await SecretRmCommand.run([SECRET_KEY_2], import.meta.url);
		}
	});
});
