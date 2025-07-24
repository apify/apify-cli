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

	it('should work', async () => {
		await testRunCommand(SecretsAddCommand, {
			args_name: SECRET_KEY,
			args_value: SECRET_VALUE,
		});

		const secrets = getSecretsFile();
		expect(secrets[SECRET_KEY]).to.eql(SECRET_VALUE);
	});

	afterAll(async () => {
		const secrets = getSecretsFile();

		if (secrets[SECRET_KEY]) {
			await testRunCommand(SecretsRmCommand, {
				args_name: SECRET_KEY,
			});
		}
	});
});
