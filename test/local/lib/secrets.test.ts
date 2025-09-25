import { replaceSecretsValue, transformEnvToEnvVars } from '../../../src/lib/secrets.js';

describe('Secrets', () => {
	describe('replaceSecretsValue()', () => {
		it('should work with valid secrets', () => {
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

		it('should throw error when secret is missing', () => {
			const secrets = {
				myProdToken: 'mySecretToken',
			};
			const env = {
				TOKEN: '@myProdToken',
				WARNING: '@doesNotExist',
			};

			expect(() => replaceSecretsValue(env, secrets)).toThrow(
				'Missing secrets: doesNotExist. Set them by calling "apify secrets add <SECRET_NAME> <SECRET_VALUE>".'
			);
		});

		it('should throw error with multiple missing secrets', () => {
			const secrets = {};
			const env = {
				TOKEN: '@missingSecret1',
				API_KEY: '@missingSecret2',
			};

			expect(() => replaceSecretsValue(env, secrets)).toThrow(
				'Missing secrets: missingSecret1, missingSecret2. Set them by calling "apify secrets add <SECRET_NAME> <SECRET_VALUE>".'
			);
		});
	});

	describe('transformEnvToEnvVars()', () => {
		it('should work with valid secrets', () => {
			const secrets = {
				myProdToken: 'mySecretToken',
				mongoUrl: 'mongo://bla@bla:supermongo.com:27017',
			};
			const env = {
				TOKEN: '@myProdToken',
				USER: 'jakub.drobnik@apify.com',
				MONGO_URL: '@mongoUrl',
			};
			const envVars = transformEnvToEnvVars(env, secrets);

			expect(envVars).toStrictEqual([
				{
					name: 'TOKEN',
					value: secrets.myProdToken,
					isSecret: true,
				},
				{
					name: 'USER',
					value: 'jakub.drobnik@apify.com',
				},
				{
					name: 'MONGO_URL',
					value: secrets.mongoUrl,
					isSecret: true,
				},
			]);
		});

		it('should throw error when secret is missing', () => {
			const secrets = {
				myProdToken: 'mySecretToken',
			};
			const env = {
				TOKEN: '@myProdToken',
				WARNING: '@doesNotExist',
			};

			expect(() => transformEnvToEnvVars(env, secrets)).toThrow(
				'Missing secrets: doesNotExist. Set them by calling "apify secrets add <SECRET_NAME> <SECRET_VALUE>".'
			);
		});

		it('should throw error with multiple missing secrets', () => {
			const secrets = {};
			const env = {
				TOKEN: '@missingSecret1',
				API_KEY: '@missingSecret2',
			};

			expect(() => transformEnvToEnvVars(env, secrets)).toThrow(
				'Missing secrets: missingSecret1, missingSecret2. Set them by calling "apify secrets add <SECRET_NAME> <SECRET_VALUE>".'
			);
		});
	});
});
