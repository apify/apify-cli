import { describe, expect, test } from 'vitest';

import { normalizeInputSchema } from '../../../../../src/lib/schema-to-ts/preprocess/input.js';

describe('normalizeInputSchema', () => {
	test('leaves the format sugar in place — the core ignores what it does not recognise', () => {
		const schema = {
			type: 'object',
			schemaVersion: 1,
			title: 'A title',
			properties: {
				a: {
					type: 'string',
					editor: 'textfield',
					prefill: 'x',
					example: 'y',
					pattern: '^a$',
					unit: 'ms',
					isSecret: true,
					sectionCaption: 'Section',
					enumTitles: ['One'],
				},
			},
			required: ['a'],
		};
		expect(normalizeInputSchema(schema)).toEqual(schema);
	});
});
