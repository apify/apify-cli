import { countLegacyEnvVars, hasLegacyEnvVars } from '../../../../src/lib/env-vars/legacy.js';

describe('countLegacyEnvVars', () => {
	it.each([
		['an absent key', undefined],
		['null', null],
		['an empty object', {}],
		['a string', 'MY_VAR=value'],
		['a number', 42],
		['an array', ['@secret', 'value']],
	])('counts 0 for %s', (_label, input) => {
		expect(countLegacyEnvVars(input)).toEqual({ envVarsCount: 0, secretRefsCount: 0 });
	});

	it('counts plain values as env vars only', () => {
		expect(countLegacyEnvVars({ A: 'one', B: 'two', C: '' })).toEqual({ envVarsCount: 3, secretRefsCount: 0 });
	});

	it('counts @secret references', () => {
		expect(countLegacyEnvVars({ TOKEN: '@myToken', KEY: '@key', PLAIN: 'value' })).toEqual({
			envVarsCount: 3,
			secretRefsCount: 2,
		});
	});

	it('does not count a lone @, an @ inside a value, or a non-string value as a reference', () => {
		expect(countLegacyEnvVars({ AT: '@', EMAIL: 'user@example.com', NUM: 1, FLAG: true })).toEqual({
			envVarsCount: 4,
			secretRefsCount: 0,
		});
	});
});

describe('hasLegacyEnvVars', () => {
	it.each([
		['no config', undefined],
		['no environmentVariables', { name: 'actor' }],
		['an empty environmentVariables', { environmentVariables: {} }],
		['a non-object environmentVariables', { environmentVariables: 'A=1' }],
	])('is false for %s', (_label, config) => {
		expect(hasLegacyEnvVars(config)).toBe(false);
	});

	it('is true for a non-empty environmentVariables', () => {
		expect(hasLegacyEnvVars({ environmentVariables: { A: '' } })).toBe(true);
	});
});
