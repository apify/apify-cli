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

	describe('Integration scenarios', () => {
		it('should handle mixed environment variables correctly', () => {
			const secrets = {
				validSecret: 'validValue',
			};
			const env = {
				VALID_SECRET: '@validSecret',
				NORMAL_VAR: 'normalValue',
				INVALID_SECRET: '@missingSecret',
			};

			// Should fail because of missing secret
			expect(() => transformEnvToEnvVars(env, secrets)).toThrow('Missing secrets: missingSecret');
		});

		it('should work with empty environment variables', () => {
			const result = transformEnvToEnvVars({});
			expect(result).toEqual([]);
		});

		it('should work with environment variables that contain no secrets', () => {
			const env = {
				NORMAL_VAR1: 'value1',
				NORMAL_VAR2: 'value2',
			};
			const result = transformEnvToEnvVars(env);
			
			expect(result).toEqual([
				{
					name: 'NORMAL_VAR1',
					value: 'value1',
				},
				{
					name: 'NORMAL_VAR2',
					value: 'value2',
				},
			]);
		});

		it('should maintain order of environment variables', () => {
			const secrets = {
				secret1: 'value1',
				secret2: 'value2',
			};
			const env = {
				THIRD: 'third',
				FIRST: '@secret1',
				SECOND: '@secret2',
			};
			const result = transformEnvToEnvVars(env, secrets);
			
			expect(result.map(r => r.name)).toEqual(['THIRD', 'FIRST', 'SECOND']);
		});
	});
});
