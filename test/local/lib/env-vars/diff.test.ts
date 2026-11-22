import type { EnvVarComparison } from '../../../../src/lib/env-vars/diff.js';
import { compareEnvVars, envPushWrites, planEnvPush } from '../../../../src/lib/env-vars/diff.js';
import type { PlatformEnvVar } from '../../../../src/lib/env-vars/platform.js';

const SECRET_VALUE = 's3cr3t-sentinel';

const platform: PlatformEnvVar[] = [
	{ name: 'SAME', isSecret: false, value: 'same-value' },
	{ name: 'DIFFERS', isSecret: false, value: 'old-value' },
	{ name: 'SECRET', isSecret: true },
	{ name: 'ONLY_PLATFORM', isSecret: false, value: 'platform-value' },
	{ name: 'ONLY_PLATFORM_SECRET', isSecret: true },
];

describe('compareEnvVars', () => {
	it('classifies every variable, sorted by name, without values', () => {
		const comparison = compareEnvVars(
			{ SAME: 'same-value', DIFFERS: 'new-value', SECRET: SECRET_VALUE, ONLY_LOCAL: SECRET_VALUE },
			platform,
		);

		expect(comparison).toEqual([
			{ name: 'DIFFERS', status: 'differs', isSecret: false, localEmpty: false },
			{ name: 'ONLY_LOCAL', status: 'onlyLocal', isSecret: false, localEmpty: false },
			{ name: 'ONLY_PLATFORM', status: 'onlyPlatform', isSecret: false, localEmpty: false },
			{ name: 'ONLY_PLATFORM_SECRET', status: 'onlyPlatform', isSecret: true, localEmpty: false },
			{ name: 'SAME', status: 'same', isSecret: false, localEmpty: false },
			{ name: 'SECRET', status: 'secret', isSecret: true, localEmpty: false },
		]);
		expect(JSON.stringify(comparison)).not.toContain(SECRET_VALUE);
		expect(JSON.stringify(comparison)).not.toContain('value"');
	});

	it('marks keys with an empty value in .env', () => {
		expect(compareEnvVars({ DIFFERS: '', SECRET: '', NEW: '' }, platform)).toEqual(
			expect.arrayContaining([
				{ name: 'DIFFERS', status: 'differs', isSecret: false, localEmpty: true },
				{ name: 'NEW', status: 'onlyLocal', isSecret: false, localEmpty: true },
				{ name: 'SECRET', status: 'secret', isSecret: true, localEmpty: true },
			]),
		);
	});

	it('ignores names inherited from the object prototype', () => {
		expect(compareEnvVars({}, [{ name: 'toString', isSecret: false, value: 'v' }])).toEqual([
			{ name: 'toString', status: 'onlyPlatform', isSecret: false, localEmpty: false },
		]);
	});
});

describe('planEnvPush', () => {
	const entry = (status: EnvVarComparison['status'], isSecret = false, localEmpty = false): EnvVarComparison => ({
		name: 'X',
		status,
		isSecret,
		localEmpty,
	});
	const actionOf = (comparison: EnvVarComparison, options = { prune: false, plain: false }) =>
		planEnvPush([comparison], options)[0];

	it.each([
		['onlyLocal', false, false, { action: 'add', isSecret: true }],
		['onlyLocal', false, true, { action: 'skip-empty', isSecret: true }],
		['differs', false, false, { action: 'update', isSecret: false }],
		['differs', false, true, { action: 'skip-empty', isSecret: false }],
		['secret', true, false, { action: 'replace-secret', isSecret: true }],
		['secret', true, true, { action: 'skip-empty', isSecret: true }],
		['same', false, false, { action: 'unchanged', isSecret: false }],
		['onlyPlatform', false, false, { action: 'keep', isSecret: false }],
		['onlyPlatform', true, false, { action: 'keep', isSecret: true }],
	] as const)('maps %s (secret %s, empty %s) without --prune', (status, isSecret, localEmpty, expected) => {
		expect(actionOf(entry(status, isSecret, localEmpty))).toEqual({ name: 'X', ...expected });
	});

	it('removes variables only on the platform with --prune', () => {
		expect(actionOf(entry('onlyPlatform', true), { prune: true, plain: false })).toEqual({
			name: 'X',
			action: 'remove',
			isSecret: true,
		});
	});

	it('creates new variables as plain with --plain and keeps the type of existing ones', () => {
		expect(actionOf(entry('onlyLocal'), { prune: false, plain: true })).toMatchObject({ isSecret: false });
		expect(actionOf(entry('secret', true), { prune: false, plain: true })).toMatchObject({ isSecret: true });
		expect(actionOf(entry('differs', false), { prune: false, plain: false })).toMatchObject({ isSecret: false });
	});

	it('keeps the order of the comparison', () => {
		const steps = planEnvPush(compareEnvVars({ B: '1', A: '2' }, [{ name: 'C', isSecret: false, value: 'c' }]), {
			prune: true,
			plain: false,
		});

		expect(steps.map(({ name }) => name)).toEqual(['A', 'B', 'C']);
	});
});

describe('envPushWrites', () => {
	it('returns only the writes: adds, then updates and replacements, then removals, each by name', () => {
		const writes = envPushWrites([
			{ name: 'A_REMOVE', action: 'remove', isSecret: false },
			{ name: 'B_UPDATE', action: 'update', isSecret: false },
			{ name: 'C_ADD', action: 'add', isSecret: true },
			{ name: 'D_KEEP', action: 'keep', isSecret: false },
			{ name: 'A_REPLACE', action: 'replace-secret', isSecret: true },
			{ name: 'E_SAME', action: 'unchanged', isSecret: false },
			{ name: 'F_EMPTY', action: 'skip-empty', isSecret: true },
			{ name: 'B_ADD', action: 'add', isSecret: false },
		]);

		expect(writes.map(({ name }) => name)).toEqual(['B_ADD', 'C_ADD', 'A_REPLACE', 'B_UPDATE', 'A_REMOVE']);
	});
});
