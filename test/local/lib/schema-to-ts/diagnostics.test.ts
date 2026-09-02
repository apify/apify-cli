import { describe, expect, test } from 'vitest';

import { Report, pointer } from '../../../../src/lib/schema-to-ts/diagnostics.js';

describe('pointer', () => {
	test('appends segments to a base', () => {
		expect(pointer('', 'properties', 'a')).toBe('/properties/a');
		expect(pointer('/properties/a', 'items')).toBe('/properties/a/items');
	});

	test('root is the empty string', () => {
		expect(pointer('')).toBe('');
	});

	test('escapes ~ and / per RFC 6901', () => {
		expect(pointer('', 'properties', 'a/b')).toBe('/properties/a~1b');
		expect(pointer('', 'properties', 'a~b')).toBe('/properties/a~0b');
		// `~1` in a raw name must not be mistaken for an escaped slash on the way back.
		expect(pointer('', 'properties', '~1')).toBe('/properties/~01');
	});
});

describe('Report', () => {
	test('routes by severity and keeps insertion order', () => {
		const report = new Report();
		report.warn('/a', 'unsupported-keyword', 'w');
		report.error('/b', 'malformed-type', 'e');
		report.notice('/c', 'empty-schema', 'n');

		expect(report.diagnostics).toEqual([
			{ path: '/a', severity: 'warning', code: 'unsupported-keyword', message: 'w' },
			{ path: '/b', severity: 'error', code: 'malformed-type', message: 'e' },
		]);
		expect(report.notices).toEqual([{ path: '/c', code: 'empty-schema', message: 'n' }]);
	});

	test('starts empty', () => {
		const report = new Report();
		expect(report.diagnostics).toEqual([]);
		expect(report.notices).toEqual([]);
	});
});
