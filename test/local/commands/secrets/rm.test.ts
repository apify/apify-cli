import { SecretsAddCommand } from '../../../../src/commands/secrets/add.js';
import { SecretsRmCommand } from '../../../../src/commands/secrets/rm.js';
import { runCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { getSecretsFile } from '../../../../src/lib/secrets.js';
import { useAuthSetup } from '../../../__setup__/hooks/useAuthSetup.js';

const SECRET_KEY = 'mySecret';

useAuthSetup({ perTest: false });

describe('apify secrets:rm', () => {
	beforeAll(async () => {
		const secrets = getSecretsFile();
		if (!secrets[SECRET_KEY]) {
			await runCommand(SecretsAddCommand, {
				args_name: SECRET_KEY,
				args_value: 'mySecretValue',
			});
		}
	});

	it('should work', async () => {
		await runCommand(SecretsRmCommand, {
			args_name: SECRET_KEY,
		});

		const secrets = getSecretsFile();
		expect(secrets[SECRET_KEY]).to.eql(undefined);
	});
});
