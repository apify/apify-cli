import { SecretsAddCommand } from '../../../../src/commands/secrets/add.js';
import { SecretsLsCommand } from '../../../../src/commands/secrets/ls.js';
import { SecretsRmCommand } from '../../../../src/commands/secrets/rm.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { __resetDeprecationWarningsForTests } from '../../../../src/lib/env-vars/deprecations.js';
import { getSecretsFile } from '../../../../src/lib/secrets.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';

const SECRET_KEY_1 = 'testSecret1';
const SECRET_KEY_2 = 'testSecret2';
const SECRET_VALUE = 'testSecretValue';

const { logMessages } = useConsoleSpy();

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

	beforeEach(() => {
		__resetDeprecationWarningsForTests();
	});

	it('should list all secrets', async () => {
		await testRunCommand(SecretsLsCommand, { flags_json: true });

		// Verify the command outputs our test secrets
		const output = logMessages.log.join('\n');
		expect(output).to.include(SECRET_KEY_1);
		expect(output).to.include(SECRET_KEY_2);
	});

	it('prints the deprecation warning to stderr and keeps --json output valid', async () => {
		const instance = await testRunCommand(SecretsLsCommand, { flags_json: true });

		const { keys } = JSON.parse(logMessages.log.join('\n'));
		expect(keys).toEqual(expect.arrayContaining([SECRET_KEY_1, SECRET_KEY_2]));

		const deprecationLines = logMessages.error.filter((line) =>
			line.includes('apify secrets and "@secret" references are deprecated'),
		);
		expect(deprecationLines).toHaveLength(1);
		expect(instance['telemetryData'].deprecationWarnings).toEqual(['secretsCommand']);
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
