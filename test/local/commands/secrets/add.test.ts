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

	afterEach(() => {
		process.exitCode = undefined;
	});

	it('should work', async () => {
		await testRunCommand(SecretsAddCommand, {
			args_name: SECRET_KEY,
			args_value: SECRET_VALUE,
		});

		const secrets = getSecretsFile();
		expect(secrets[SECRET_KEY]).to.eql(SECRET_VALUE);
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
