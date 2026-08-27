import { ActorsPushCommand } from '../../../src/commands/actors/push.js';
import { ValidateSchemaCommand } from '../../../src/commands/validate-schema.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { validInputSchemaPath } from '../../__setup__/input-schemas/paths.js';

describe('Command Framework', () => {
	test('testRunCommand helper works', async () => {
		await testRunCommand(ValidateSchemaCommand, {
			args_path: validInputSchemaPath,
		});
	});

	describe('multi-value string flags', () => {
		const parseFlags = (
			rawFlags: Record<string, unknown>,
			rawTokens: { kind: string; name: string; rawName: string }[] = [],
		) => {
			const instance = new ActorsPushCommand('test-cli', 'push', 'push');
			// @ts-expect-error accessing internals to unit-test flag parsing in isolation
			// eslint-disable-next-line dot-notation
			instance.flags = {};
			// eslint-disable-next-line dot-notation
			instance['_parseFlags'](rawFlags, rawTokens as never);
			// @ts-expect-error accessing internals to unit-test flag parsing in isolation
			return instance.flags;
		};

		test('collects repeated values into an array', () => {
			expect(parseFlags({ env: ['A=1', 'B=2', 'C=3'] }).env).toStrictEqual(['A=1', 'B=2', 'C=3']);
			expect(parseFlags({ env: ['A=1'] }).env).toStrictEqual(['A=1']);
		});

		test('wraps scalar values injected by the test harness', () => {
			expect(parseFlags({ env: 'A=1' }).env).toStrictEqual(['A=1']);
		});

		test('stays undefined when not provided', () => {
			expect(parseFlags({}).env).toBeUndefined();
		});

		test('single-value flags still reject repeated values', () => {
			expect(() => parseFlags({ 'build-tag': ['a', 'b'] })).toThrow();
		});

		test('strips the leading = of every value only when the short form is used', () => {
			// -e='A=1' parses the value as '=A=1'; the parser must strip it per element
			const shortFormTokens = [{ kind: 'option', name: 'env', rawName: '-e' }];
			// parseArgs reports the canonical name for both forms; only rawName distinguishes them
			const longFormTokens = [{ kind: 'option', name: 'env', rawName: '--env' }];

			expect(parseFlags({ env: ['=A=1', '=B=2'] }, shortFormTokens).env).toStrictEqual(['A=1', 'B=2']);
			// long-form values are kept verbatim, even when they start with =
			expect(parseFlags({ env: ['=A=1'] }, longFormTokens).env).toStrictEqual(['=A=1']);
			expect(parseFlags({ env: ['=A=1'] }).env).toStrictEqual(['=A=1']);
		});
	});
});
