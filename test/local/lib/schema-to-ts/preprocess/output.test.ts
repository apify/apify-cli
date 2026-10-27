import { describe, expect, test } from 'vitest';

import { jsonSchemaToIR } from '../../../../../src/lib/schema-to-ts/parser.js';
import { normalizeOutputSchema } from '../../../../../src/lib/schema-to-ts/preprocess/output.js';

describe('normalizeOutputSchema', () => {
	test('defaults an output schema without a type to an object', () => {
		const schema = { properties: { resultPage: { type: 'string' } }, required: ['resultPage'] };
		const normalized = normalizeOutputSchema(schema);
		expect(normalized).toEqual({ ...schema, type: 'object' });
		expect(schema).not.toHaveProperty('type');
		expect(jsonSchemaToIR(normalized).ir.root).toMatchObject({ kind: 'object' });
	});

	test('preserves explicit types and schemas without properties', () => {
		const explicit = { type: 'array', properties: {} };
		const missingProperties = { actorOutputSchemaVersion: 1 };
		expect(normalizeOutputSchema(explicit)).toBe(explicit);
		expect(normalizeOutputSchema(missingProperties)).toBe(missingProperties);
	});
});
