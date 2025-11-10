import { SecretsAddCommand } from '../../../../src/commands/secrets/add.js';
import { SecretsRmCommand } from '../../../../src/commands/secrets/rm.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { getSecretsFile } from '../../../../src/lib/secrets.js';

const SECRET_KEY = 'mySecret';
const SECRET_VALUE = 'mySecretValue';

describe('apify secrets add', () => {
	beforeAll(async () => {
		const secrets = getSecretsFile();
		if (secrets[SECRET_KEY]) {
			await testRunCommand(SecretsRmCommand, {
				args_name: SECRET_KEY,
			});
		}
	});

	afterEach(async () => {
		// Clean up after each test
		const secrets = getSecretsFile();
		if (secrets[SECRET_KEY]) {
			await testRunCommand(SecretsRmCommand, {
				args_name: SECRET_KEY,
			});
		}
	});

	it('should work', async () => {
		await testRunCommand(SecretsAddCommand, {
			args_name: SECRET_KEY,
			args_value: SECRET_VALUE,
		});

		const secrets = getSecretsFile();
		expect(secrets[SECRET_KEY]).to.eql(SECRET_VALUE);
	});

	it('should throw error when adding duplicate secret', async () => {
		// First add a secret
		await testRunCommand(SecretsAddCommand, {
			args_name: SECRET_KEY,
			args_value: SECRET_VALUE,
		});

		// Try to add the same secret again and expect it to throw
		await expect(
			testRunCommand(SecretsAddCommand, {
				args_name: SECRET_KEY,
				args_value: SECRET_VALUE,
			}),
		).rejects.toThrow(`Secret with name ${SECRET_KEY} already exists`);
	});
});
