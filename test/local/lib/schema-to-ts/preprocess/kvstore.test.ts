import { describe, expect, test } from 'vitest';

import { compile } from '../../../../../src/lib/schema-to-ts/compile.js';
import { jsonSchemaToIR } from '../../../../../src/lib/schema-to-ts/parser.js';
import { normalizeKvstoreSchema } from '../../../../../src/lib/schema-to-ts/preprocess/kvstore.js';

describe('normalizeKvstoreSchema', () => {
	const results = { type: 'object', properties: { totalItems: { type: 'integer' } }, required: ['totalItems'] };

	test('turns collections into properties and requires every key', () => {
		expect(
			normalizeKvstoreSchema({
				actorKeyValueStoreSchemaVersion: 1,
				title: 'Test KVS',
				collections: {
					results: { title: 'Results', contentTypes: ['application/json'], key: 'RESULTS', jsonSchema: results },
					metrics: { title: 'Metrics', keyPrefix: 'metric-', jsonSchema: { type: 'number' } },
				},
			}),
		).toEqual({
			type: 'object',
			properties: { results, metrics: { type: 'number' } },
			required: ['results', 'metrics'],
			additionalProperties: false,
		});
	});

	test('a collection with no jsonSchema is unknown, which is a notice and not an error', () => {
		const normalized = normalizeKvstoreSchema({
			collections: { screenshots: { title: 'Screenshots', contentTypes: ['image/png'], keyPrefix: 'screenshot-' } },
		});
		expect(normalized).toEqual({
			type: 'object',
			properties: { screenshots: {} },
			required: ['screenshots'],
			additionalProperties: false,
		});

		const lifted = jsonSchemaToIR(normalized);
		expect(lifted.ir.root).toEqual({
			kind: 'object',
			props: [{ name: 'screenshots', node: { kind: 'unknown' }, required: true, hasDefault: false }],
			open: false,
		});
		expect(lifted.diagnostics).toEqual([]);
		expect(lifted.notices).toEqual([
			{
				path: '/properties/screenshots',
				code: 'empty-schema',
				message: 'no type information, treated as unknown',
			},
		]);
	});

	test('applies the nullable rewrite inside a collection schema', () => {
		expect(
			normalizeKvstoreSchema({
				collections: {
					results: { jsonSchema: { type: 'object', properties: { a: { type: 'string', nullable: true } } } },
				},
			}),
		).toMatchObject({ properties: { results: { properties: { a: { type: ['string', 'null'] } } } } });
	});

	test('the lookup table is closed for the writer too, so a misspelled collection is an error', () => {
		const schema = normalizeKvstoreSchema({ collections: { results: { jsonSchema: results } } });

		for (const variant of ['supplied', 'received'] as const) {
			const { source } = compile(schema, { types: [{ name: 'keyValueStore', variant }] });
			// An open table would read `= ({` and carry an index signature; the record inside it
			// stays open under `supplied`, which is a separate and correct thing.
			expect(source).toContain('export type keyValueStore = {');
			expect(source).toContain('results: ');
		}
	});

	test('yields undefined when there is no collections key, which the core reports at the root', () => {
		expect(normalizeKvstoreSchema({ actorKeyValueStoreSchemaVersion: 1 })).toBeUndefined();

		const lifted = jsonSchemaToIR(normalizeKvstoreSchema({ actorKeyValueStoreSchemaVersion: 1 }));
		expect(lifted.ir.root).toEqual({ kind: 'unknown' });
		expect(lifted.diagnostics).toEqual([
			{
				path: '',
				severity: 'error',
				code: 'malformed-schema',
				message: 'expected a JSON object, got undefined',
			},
		]);
	});

	test('passes non-objects through, so the diagnostic names what was actually there', () => {
		for (const [raw, expected] of [
			[null, 'null'],
			['nope', 'string ("nope")'],
			[42, 'number (42)'],
			[[], 'an array'],
		] as const) {
			expect(normalizeKvstoreSchema(raw)).toEqual(raw);
			expect(jsonSchemaToIR(normalizeKvstoreSchema(raw)).diagnostics[0]?.message).toBe(
				`expected a JSON object, got ${expected}`,
			);
		}
	});

	test('does not judge a jsonSchema it cannot read — the core names it', () => {
		const lifted = jsonSchemaToIR(normalizeKvstoreSchema({ collections: { results: { jsonSchema: 'garbage' } } }));
		expect(lifted.diagnostics).toEqual([
			{
				path: '/properties/results',
				severity: 'error',
				code: 'malformed-schema',
				message: 'expected a JSON object, got string ("garbage")',
			},
		]);
	});

	test('an empty collections map is an empty table rather than a diagnostic', () => {
		expect(normalizeKvstoreSchema({ collections: {} })).toEqual({
			type: 'object',
			properties: {},
			required: [],
			additionalProperties: false,
		});
		expect(jsonSchemaToIR(normalizeKvstoreSchema({ collections: {} })).diagnostics).toEqual([]);
	});
});
