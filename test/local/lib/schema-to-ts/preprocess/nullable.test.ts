import { describe, expect, test } from 'vitest';

import { normalizeNullable } from '../../../../../src/lib/schema-to-ts/preprocess/nullable.js';

describe('normalizeNullable', () => {
	test('widens the declared type and consumes the flag', () => {
		expect(normalizeNullable({ type: 'string', nullable: true })).toEqual({ type: ['string', 'null'] });
	});

	test('a false flag is dropped without widening anything', () => {
		expect(normalizeNullable({ type: 'integer', nullable: false })).toEqual({ type: 'integer' });
	});

	test('appends to an existing type array, and never twice', () => {
		expect(normalizeNullable({ type: ['string', 'number'], nullable: true })).toEqual({
			type: ['string', 'number', 'null'],
		});
		expect(normalizeNullable({ type: ['string', 'null'], nullable: true })).toEqual({
			type: ['string', 'null'],
		});
		expect(normalizeNullable({ type: 'null', nullable: true })).toEqual({ type: 'null' });
	});

	test('is idempotent', () => {
		const once = normalizeNullable({ type: 'string', nullable: true });
		expect(normalizeNullable(once)).toEqual(once);
	});

	test('infers the type from siblings when it is absent, so nothing is silently lost', () => {
		expect(normalizeNullable({ properties: { a: { type: 'string' } }, nullable: true })).toEqual({
			properties: { a: { type: 'string' } },
			type: ['object', 'null'],
		});
		expect(normalizeNullable({ additionalProperties: { type: 'string' }, nullable: true })).toEqual({
			additionalProperties: { type: 'string' },
			type: ['object', 'null'],
		});
		expect(normalizeNullable({ items: { type: 'string' }, nullable: true })).toEqual({
			items: { type: 'string' },
			type: ['array', 'null'],
		});
	});

	test('adds no type key to a bare schema, which already admits null', () => {
		expect(normalizeNullable({ nullable: true })).toEqual({});
		expect(normalizeNullable({ nullable: true })).not.toHaveProperty('type');
	});

	test('leaves a malformed type alone for the core to report', () => {
		expect(normalizeNullable({ type: 42, nullable: true })).toEqual({ type: 42 });
	});

	test('recurses through every subschema position', () => {
		expect(
			normalizeNullable({
				type: 'object',
				properties: {
					a: { type: 'string', nullable: true },
					b: { type: 'array', items: { type: 'number', nullable: true } },
					c: { type: 'object', additionalProperties: { type: 'boolean', nullable: true } },
					d: { type: 'object', properties: { deep: { type: 'string', nullable: true } } },
				},
			}),
		).toEqual({
			type: 'object',
			properties: {
				a: { type: ['string', 'null'] },
				b: { type: 'array', items: { type: ['number', 'null'] } },
				c: { type: 'object', additionalProperties: { type: ['boolean', 'null'] } },
				d: { type: 'object', properties: { deep: { type: ['string', 'null'] } } },
			},
		});
	});

	test('recurses into positional items members', () => {
		expect(normalizeNullable({ type: 'array', items: [{ type: 'string', nullable: true }] })).toEqual({
			type: 'array',
			items: [{ type: ['string', 'null'] }],
		});
	});

	test('never rewrites data — a `nullable` key inside an example is not a schema', () => {
		const schema = {
			type: 'object',
			properties: { a: { type: 'string' } },
			default: { nullable: true, type: 'string' },
			example: { nullable: true },
			prefill: [{ nullable: true }],
			enum: [{ nullable: true }],
		};
		expect(normalizeNullable(schema)).toEqual(schema);
	});

	test('preserves property order', () => {
		const result = normalizeNullable({
			type: 'object',
			properties: { z: { type: 'string' }, a: { type: 'string', nullable: true }, m: { type: 'string' } },
		}) as { properties: Record<string, unknown> };
		expect(Object.keys(result.properties)).toEqual(['z', 'a', 'm']);
	});

	test("does not mutate the caller's object", () => {
		const schema = { type: 'string', nullable: true, properties: { a: { type: 'string', nullable: true } } };
		const before = structuredClone(schema);
		normalizeNullable(schema);
		expect(schema).toEqual(before);
	});

	test('passes non-objects through', () => {
		for (const value of [null, undefined, 42, 'nope', true]) {
			expect(normalizeNullable(value)).toBe(value);
		}
	});
});
