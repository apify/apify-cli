import { describe, expect, test } from 'vitest';

import { jsonSchemaToIR } from '../../../../../src/lib/schema-to-ts/json-schema-to-ir.js';
import { normalizeDatasetSchema } from '../../../../../src/lib/schema-to-ts/preprocess/dataset.js';

describe('normalizeDatasetSchema', () => {
	test('extracts fields and drops everything around it', () => {
		const fields = { type: 'object', properties: { a: { type: 'string' } } };
		expect(
			normalizeDatasetSchema({
				actorSpecification: 1,
				fields,
				views: { overview: { title: 'Overview', display: { component: 'table' } } },
				$schema: 'https://apify.com/schemas/v1/dataset.json',
			}),
		).toEqual(fields);
	});

	test('applies the nullable rewrite — real dataset schemas use it too', () => {
		expect(
			normalizeDatasetSchema({
				fields: {
					type: 'object',
					properties: { a: { type: 'string', nullable: true } },
					additionalProperties: true,
					nullable: true,
				},
			}),
		).toEqual({
			type: ['object', 'null'],
			properties: { a: { type: ['string', 'null'] } },
			additionalProperties: true,
		});
	});

	test('yields undefined when there is no fields key, which the core reports at the root', () => {
		expect(normalizeDatasetSchema({ actorSpecification: 1 })).toBeUndefined();

		const lifted = jsonSchemaToIR(normalizeDatasetSchema({ actorSpecification: 1 }));
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
			expect(normalizeDatasetSchema(raw)).toEqual(raw);
			const lifted = jsonSchemaToIR(normalizeDatasetSchema(raw));
			expect(lifted.diagnostics[0]?.message).toBe(`expected a JSON object, got ${expected}`);
		}
	});

	test('does not care what fields contains — the core judges that', () => {
		expect(normalizeDatasetSchema({ fields: 'garbage' })).toBe('garbage');
		expect(jsonSchemaToIR(normalizeDatasetSchema({ fields: 'garbage' })).diagnostics[0]?.code).toBe('malformed-schema');
	});
});
