import { ACTOR_ENV_VARS, APIFY_ENV_VARS } from '@apify/consts';

import { CRAWLEE_INPUT_KEY_ENV, inputFileRegExp, resolveInputKey } from '../../../src/lib/input-key.js';

describe('resolveInputKey', () => {
	const envVars = [ACTOR_ENV_VARS.INPUT_KEY, APIFY_ENV_VARS.INPUT_KEY, CRAWLEE_INPUT_KEY_ENV] as const;

	afterEach(() => {
		for (const key of envVars) {
			delete process.env[key];
		}
	});

	it('returns "INPUT" when no env vars are set', () => {
		expect(resolveInputKey()).toBe('INPUT');
	});

	it('returns ACTOR_INPUT_KEY when set', () => {
		process.env[ACTOR_ENV_VARS.INPUT_KEY] = 'FROM_ACTOR';
		expect(resolveInputKey()).toBe('FROM_ACTOR');
	});

	it('returns APIFY_INPUT_KEY when ACTOR_INPUT_KEY is not set', () => {
		process.env[APIFY_ENV_VARS.INPUT_KEY] = 'FROM_APIFY';
		expect(resolveInputKey()).toBe('FROM_APIFY');
	});

	it('returns CRAWLEE_INPUT_KEY when neither ACTOR nor APIFY is set', () => {
		process.env[CRAWLEE_INPUT_KEY_ENV] = 'FROM_CRAWLEE';
		expect(resolveInputKey()).toBe('FROM_CRAWLEE');
	});

	it('ACTOR_INPUT_KEY takes priority over APIFY and CRAWLEE', () => {
		process.env[ACTOR_ENV_VARS.INPUT_KEY] = 'A';
		process.env[APIFY_ENV_VARS.INPUT_KEY] = 'B';
		process.env[CRAWLEE_INPUT_KEY_ENV] = 'C';
		expect(resolveInputKey()).toBe('A');
	});

	it('APIFY_INPUT_KEY takes priority over CRAWLEE', () => {
		process.env[APIFY_ENV_VARS.INPUT_KEY] = 'B';
		process.env[CRAWLEE_INPUT_KEY_ENV] = 'C';
		expect(resolveInputKey()).toBe('B');
	});
});

describe('inputFileRegExp', () => {
	it('matches key without extension', () => {
		expect(inputFileRegExp('INPUT').test('INPUT')).toBe(true);
	});

	it('matches key with .json extension', () => {
		expect(inputFileRegExp('INPUT').test('INPUT.json')).toBe(true);
	});

	it('matches key with .bin extension', () => {
		expect(inputFileRegExp('INPUT').test('INPUT.bin')).toBe(true);
	});

	it('does not match partial name', () => {
		expect(inputFileRegExp('INPUT').test('INPUT_BACKUP')).toBe(false);
	});

	it('does not match prefixed name', () => {
		expect(inputFileRegExp('INPUT').test('MY_INPUT')).toBe(false);
	});

	it('works with custom key', () => {
		const re = inputFileRegExp('CUSTOM_INPUT');
		expect(re.test('CUSTOM_INPUT')).toBe(true);
		expect(re.test('CUSTOM_INPUT.json')).toBe(true);
		expect(re.test('INPUT')).toBe(false);
		expect(re.test('INPUT.json')).toBe(false);
	});

	it('escapes regex special characters in key', () => {
		const re = inputFileRegExp('INPUT.v2');
		expect(re.test('INPUT.v2')).toBe(true);
		expect(re.test('INPUT.v2.json')).toBe(true);
		// The dot in "INPUT.v2" should be literal, not match any char
		expect(re.test('INPUTxv2')).toBe(false);
	});
});
