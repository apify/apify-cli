import { SecretsAddCommand } from '../../../../src/commands/secrets/add.js';
import { SecretsRmCommand } from '../../../../src/commands/secrets/rm.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { __resetDeprecationWarningsForTests } from '../../../../src/lib/env-vars/deprecations.js';
import { getSecretsFile } from '../../../../src/lib/secrets.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';

const SECRET_KEY = 'mySecret';
const SECRET_VALUE = 'mySecretValue';

const { logMessages } = useConsoleSpy();

describe('apify secrets add', () => {
	beforeAll(async () => {
		const secrets = getSecretsFile();
		if (secrets[SECRET_KEY]) {
			await testRunCommand(SecretsRmCommand, {
				args_name: SECRET_KEY,
			});
		}
	});

	beforeEach(() => {
		__resetDeprecationWarningsForTests();
	});

	afterEach(() => {
		process.exitCode = undefined;
	});

	it('should work', async () => {
		const instance = await testRunCommand(SecretsAddCommand, {
			args_name: SECRET_KEY,
			args_value: SECRET_VALUE,
		});

		const secrets = getSecretsFile();
		expect(secrets[SECRET_KEY]).to.eql(SECRET_VALUE);

		const deprecationLines = logMessages.error.filter((line) =>
			line.includes('apify secrets and "@secret" references are deprecated'),
		);
		expect(deprecationLines).toHaveLength(1);
		expect(logMessages.log.join('\n')).not.toContain('deprecated');
		expect(instance['telemetryData'].deprecationWarnings).toEqual(['secretsCommand']);
	});

	it('should exit with non-zero code when adding a duplicate secret', async () => {
		// The first add should succeed (added in the "should work" test above)
		await testRunCommand(SecretsAddCommand, {
			args_name: SECRET_KEY,
			args_value: SECRET_VALUE,
		});

		expect(process.exitCode).to.eql(1);
	});

	it('should exit with non-zero code when called without arguments', async () => {
		// @ts-expect-error -- We intentionally pass no args to test the missing args case
		await testRunCommand(SecretsAddCommand, {});

		expect(process.exitCode).to.eql(1);
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
