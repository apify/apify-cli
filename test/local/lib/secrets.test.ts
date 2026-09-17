import {
	findSecretReferences,
	replaceSecretsValue,
	transformEnvToEnvVars,
	validateEnvironmentVariablesShape,
} from '../../../src/lib/secrets.js';

describe('Secrets', () => {
	describe('validateEnvironmentVariablesShape()', () => {
		it('accepts undefined / null (nothing declared)', () => {
			expect(validateEnvironmentVariablesShape(undefined)).toBeNull();
			expect(validateEnvironmentVariablesShape(null)).toBeNull();
		});

		it('accepts an object of string values', () => {
			expect(validateEnvironmentVariablesShape({ TOKEN: '@mySecret', PLAIN: 'value' })).toBeNull();
		});

		it('rejects an array-shaped environmentVariables', () => {
			const err = validateEnvironmentVariablesShape([{ name: 'TOKEN', value: '@mySecret' }]);
			expect(err).toMatch(/must be a JSON object/i);
			expect(err).toMatch(/not an array/i);
			expect(err).toContain('"MY_TOKEN": "@mySecret"');
		});

		it('rejects a scalar', () => {
			expect(validateEnvironmentVariablesShape('foo')).toMatch(/must be a JSON object/i);
		});

		it('rejects an object with non-string values', () => {
			const err = validateEnvironmentVariablesShape({ TOKEN: 123, NESTED: { a: 1 } });
			expect(err).toMatch(/non-string values/i);
			expect(err).toContain('TOKEN: expected string, got number');
			expect(err).toContain('NESTED: expected string, got object');
		});
	});

	describe('findSecretReferences()', () => {
		it('returns every @name reference with its env key', () => {
			expect(
				findSecretReferences({
					TOKEN: '@myProdToken',
					PLAIN: 'literal',
					MONGO_URL: '@mongoUrl',
				}),
			).toEqual([
				{ envKey: 'TOKEN', name: 'myProdToken' },
				{ envKey: 'MONGO_URL', name: 'mongoUrl' },
			]);
		});

		it('returns an empty array when nothing is secret', () => {
			expect(findSecretReferences({ PLAIN: 'value', OTHER: 'email@apify.com' })).toEqual([]);
		});
	});

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
			const spy = vitest.spyOn(console, 'error');

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

			expect(spy).toHaveBeenCalled();
			expect(spy.mock.calls.flat().join(' ')).to.include('doesNotExist');

			spy.mockRestore();
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
			const spy = vitest.spyOn(console, 'error');

			const secrets = {};
			const env = {
				TOKEN: '@doesNotExist',
				USER: 'plain-value',
			};

			const envVars = transformEnvToEnvVars(env, secrets, {
				allowMissing: true,
			});

			expect(envVars).toStrictEqual([{ name: 'USER', value: 'plain-value' }]);

			expect(spy).toHaveBeenCalled();
			expect(spy.mock.calls.flat().join(' ')).to.include('doesNotExist');

			spy.mockRestore();
		});
	});
});
