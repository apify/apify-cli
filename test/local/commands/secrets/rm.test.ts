import { SecretsAddCommand } from '../../../../src/commands/secrets/add.js';
import { SecretsRmCommand } from '../../../../src/commands/secrets/rm.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { __resetDeprecationWarningsForTests } from '../../../../src/lib/env-vars/deprecations.js';
import { getSecretsFile } from '../../../../src/lib/secrets.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';

const SECRET_KEY = 'mySecret';

const { logMessages } = useConsoleSpy();

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

	beforeEach(() => {
		__resetDeprecationWarningsForTests();
	});

	it('should work', async () => {
		const instance = await testRunCommand(SecretsRmCommand, {
			args_name: SECRET_KEY,
		});

		const secrets = getSecretsFile();
		expect(secrets[SECRET_KEY]).to.eql(undefined);

		const deprecationLines = logMessages.error.filter((line) =>
			line.includes('apify secrets and "@secret" references are deprecated'),
		);
		expect(deprecationLines).toHaveLength(1);
		expect(logMessages.log.join('\n')).not.toContain('deprecated');
		expect(instance['telemetryData'].deprecationWarnings).toEqual(['secretsCommand']);
	});
});
