import process from 'node:process';

import { CommandExitCodes } from '../../../../src/lib/consts.js';
import { assertNoLegacyEnvVars, countLegacyEnvVars, hasLegacyEnvVars } from '../../../../src/lib/env-vars/legacy.js';

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

describe('assertNoLegacyEnvVars', () => {
	let originalExitCode: typeof process.exitCode;

	beforeEach(() => {
		originalExitCode = process.exitCode;
	});

	afterEach(() => {
		process.exitCode = originalExitCode;
	});

	it.each([
		['no config', undefined],
		['no environmentVariables', { name: 'actor' }],
		['an empty environmentVariables', { environmentVariables: {} }],
	])('passes for %s', (_label, config) => {
		expect(() => assertNoLegacyEnvVars(config)).not.toThrow();
	});

	it('fails with one line pointing to apify env migrate and exit code 5, without the values', () => {
		let thrown: Error | undefined;
		try {
			assertNoLegacyEnvVars({ environmentVariables: { A: 's3cr3t-sentinel', B: '@mySecret' } });
		} catch (err) {
			thrown = err as Error;
		}

		expect(thrown?.message).toBe(
			'"environmentVariables" in .actor/actor.json is no longer supported. Run apify env migrate to move the values to .env.',
		);
		expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
	});
});
