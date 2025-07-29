import { SecretsAddCommand } from '../../../../src/commands/secrets/add.js';
import { SecretsRmCommand } from '../../../../src/commands/secrets/rm.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { getSecretsFile } from '../../../../src/lib/secrets.js';

const SECRET_KEY = 'mySecret';

describe('apify secrets:rm', () => {
	beforeAll(async () => {
		const secrets = getSecretsFile();
		if (!secrets[SECRET_KEY]) {
			await testRunCommand(SecretsAddCommand, {
				args_name: SECRET_KEY,
				args_value: 'mySecretValue',
			});
		}
	});

	it('should work', async () => {
		await testRunCommand(SecretsRmCommand, {
			args_name: SECRET_KEY,
		});

		const secrets = getSecretsFile();
		expect(secrets[SECRET_KEY]).to.eql(undefined);
	});
});
