import { replaceSecretsValue, transformEnvToEnvVars } from '../../../src/lib/secrets.js';

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
	});
});
