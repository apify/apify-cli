import { SecretsAddCommand } from '../../../../src/commands/secrets/add.js';
import { SecretsLsCommand } from '../../../../src/commands/secrets/ls.js';
import { SecretsRmCommand } from '../../../../src/commands/secrets/rm.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { getSecretsFile } from '../../../../src/lib/secrets.js';

const SECRET_KEY_1 = 'testSecret1';
const SECRET_KEY_2 = 'testSecret2';
const SECRET_VALUE = 'testSecretValue';

describe('apify secrets ls', () => {
	beforeAll(async () => {
		// Clean up any existing test secrets
		const secrets = getSecretsFile();
		if (secrets[SECRET_KEY_1]) {
			await testRunCommand(SecretsRmCommand, {
				args_name: SECRET_KEY_1,
			});
		}
		if (secrets[SECRET_KEY_2]) {
			await testRunCommand(SecretsRmCommand, {
				args_name: SECRET_KEY_2,
			});
		}

		// Add test secrets
		await testRunCommand(SecretsAddCommand, {
			args_name: SECRET_KEY_1,
			args_value: SECRET_VALUE,
		});
		await testRunCommand(SecretsAddCommand, {
			args_name: SECRET_KEY_2,
			args_value: SECRET_VALUE,
		});
	});

	it('should list all secrets', async () => {
		await testRunCommand(SecretsLsCommand, {});

		const secrets = getSecretsFile();
		const secretKeys = Object.keys(secrets);

		// Verify our test secrets are in the list
		expect(secretKeys).to.include(SECRET_KEY_1);
		expect(secretKeys).to.include(SECRET_KEY_2);
	});

	afterAll(async () => {
		// Clean up test secrets
		const secrets = getSecretsFile();
		if (secrets[SECRET_KEY_1]) {
			await testRunCommand(SecretsRmCommand, {
				args_name: SECRET_KEY_1,
			});
		}
		if (secrets[SECRET_KEY_2]) {
			await testRunCommand(SecretsRmCommand, {
				args_name: SECRET_KEY_2,
			});
		}
	});
});
