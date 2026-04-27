import { replaceSecretsValue, transformEnvToEnvVars } from '../../../src/lib/secrets.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

const { logMessages } = useConsoleSpy();

describe('Secrets', () => {
	describe('replaceSecretsValue()', () => {
		it('should replace secret references with their values', () => {
			const secrets = {
				myProdToken: 'mySecretToken',
				mongoUrl: 'mongo://bla@bla:supermongo.com:27017',
			};
			const env = {
				TOKEN: '@myProdToken',
				USER: 'jakub.drobnik@apify.com',
				MONGO_URL: '@mongoUrl',
			};
			const updatedEnv = replaceSecretsValue(env, secrets);

			expect(updatedEnv).toStrictEqual({
				TOKEN: secrets.myProdToken,
				USER: 'jakub.drobnik@apify.com',
				MONGO_URL: secrets.mongoUrl,
			});
		});

		it('should throw an error when secrets are missing', () => {
			const secrets = {
				myProdToken: 'mySecretToken',
			};
			const env = {
				TOKEN: '@myProdToken',
				MISSING_ONE: '@doesNotExist',
				MISSING_TWO: '@alsoMissing',
			};

			expect(() => replaceSecretsValue(env, secrets)).toThrow(
				/The following secrets are missing:\n\s+- doesNotExist\n\s+- alsoMissing/,
			);
		});

		it('should mention --allow-missing-secrets in the error message', () => {
			const env = { TOKEN: '@doesNotExist' };

			expect(() => replaceSecretsValue(env, {})).toThrow(/--allow-missing-secrets/);
		});

		it('should warn instead of throwing when allowMissing is true', () => {
			const secrets = {
				myProdToken: 'mySecretToken',
			};
			const env = {
				TOKEN: '@myProdToken',
				MISSING_ONE: '@doesNotExist',
				MISSING_TWO: '@alsoMissing',
			};

			const updatedEnv = replaceSecretsValue(env, secrets, {
				allowMissing: true,
			});

			expect(updatedEnv).toStrictEqual({
				TOKEN: secrets.myProdToken,
			});

			expect(logMessages.error.length).toBeGreaterThan(0);
			expect(logMessages.error.join(' ')).to.include('doesNotExist');
		});
	});

	describe('transformEnvToEnvVars()', () => {
		it('should transform env to envVars format with secret resolution', () => {
			const secrets = {
				myProdToken: 'mySecretToken',
			};
			const env = {
				TOKEN: '@myProdToken',
				USER: 'jakub.drobnik@apify.com',
			};
			const envVars = transformEnvToEnvVars(env, secrets);

			expect(envVars).toStrictEqual([
				{ name: 'TOKEN', value: 'mySecretToken', isSecret: true },
				{ name: 'USER', value: 'jakub.drobnik@apify.com' },
			]);
		});

		it('should throw an error when secrets are missing', () => {
			const secrets = {};
			const env = {
				TOKEN: '@doesNotExist',
				USER: 'plain-value',
			};

			expect(() => transformEnvToEnvVars(env, secrets)).toThrow(
				/The following secrets are missing:\n\s+- doesNotExist/,
			);
		});

		it('should mention --allow-missing-secrets in the error message', () => {
			const env = { TOKEN: '@doesNotExist' };

			expect(() => transformEnvToEnvVars(env, {})).toThrow(/--allow-missing-secrets/);
		});

		it('should warn instead of throwing when allowMissing is true', () => {
			const secrets = {};
			const env = {
				TOKEN: '@doesNotExist',
				USER: 'plain-value',
			};

			const envVars = transformEnvToEnvVars(env, secrets, {
				allowMissing: true,
			});

			expect(envVars).toStrictEqual([{ name: 'USER', value: 'plain-value' }]);

			expect(logMessages.error.length).toBeGreaterThan(0);
			expect(logMessages.error.join(' ')).to.include('doesNotExist');
		});
	});
});
