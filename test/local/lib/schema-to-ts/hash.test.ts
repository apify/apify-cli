import { describe, expect, test } from 'vitest';

import type { EmitOptions } from '../../../../src/lib/schema-to-ts/emit.js';
import { HASH_LENGTH, irHash } from '../../../../src/lib/schema-to-ts/hash.js';
import { jsonSchemaToIR } from '../../../../src/lib/schema-to-ts/json-schema-to-ir.js';

/**
 * The tables below are the load-bearing test of the whole design: the hash must move for
 * every type-relevant edit and for nothing else. If one of these flips, either the frontend
 * started reading something it should ignore, or it stopped reading something it must.
 */

type Schema = Record<string, unknown>;

const BASE: Schema = {
	type: 'object',
	properties: {
		a: { type: 'string' },
		b: { type: 'integer', default: 1 },
		c: { type: 'array', items: { type: 'string' } },
		d: { type: 'string', enum: ['x', 'y'] },
		e: { type: 'object', properties: { z: { type: 'boolean' } } },
	},
	required: ['a'],
};

const OPTS: EmitOptions = { types: [{ name: 'Input', variant: 'received' }] };

function hashOf(schema: unknown, opts: EmitOptions = OPTS): string {
	return irHash(jsonSchemaToIR(schema).ir, opts);
}

/** Deep-clones BASE and hands it to a mutator, so cases cannot leak into each other. */
function mutate(fn: (schema: Schema) => void): Schema {
	const clone = structuredClone(BASE) as Schema;
	fn(clone);
	return clone;
}

function props(schema: Schema): Record<string, Schema> {
	return schema.properties as Record<string, Schema>;
}

describe('shape', () => {
	test('is 16 lowercase hex characters', () => {
		expect(hashOf(BASE)).toMatch(new RegExp(`^[0-9a-f]{${HASH_LENGTH}}$`));
	});

	test('is deterministic across calls', () => {
		expect(hashOf(BASE)).toBe(hashOf(BASE));
	});
});

describe('must NOT move the hash', () => {
	const cases: [string, () => Schema][] = [
		[
			'title and description',
			() =>
				mutate((s) => {
					s.title = 'A title';
					s.description = 'Prose';
					props(s).a!.title = 'Field';
					props(s).a!.description = 'More prose <b>with HTML</b>';
				}),
		],
		[
			'editor',
			() =>
				mutate((s) => {
					props(s).a!.editor = 'textarea';
				}),
		],
		[
			'prefill',
			() =>
				mutate((s) => {
					props(s).a!.prefill = 'hello';
				}),
		],
		[
			'example',
			() =>
				mutate((s) => {
					props(s).a!.example = 'hello';
				}),
		],
		[
			'unit',
			() =>
				mutate((s) => {
					props(s).b!.unit = 'ms';
				}),
		],
		[
			'isSecret',
			() =>
				mutate((s) => {
					props(s).a!.isSecret = true;
				}),
		],
		[
			'sectionCaption and sectionDescription',
			() =>
				mutate((s) => {
					props(s).a!.sectionCaption = 'Section';
					props(s).a!.sectionDescription = 'Why';
				}),
		],
		[
			'pattern, minLength, maxLength',
			() =>
				mutate((s) => {
					props(s).a!.pattern = '^a$';
					props(s).a!.minLength = 1;
					props(s).a!.maxLength = 9;
				}),
		],
		[
			'minimum and maximum',
			() =>
				mutate((s) => {
					props(s).b!.minimum = 1;
					props(s).b!.maximum = 9;
				}),
		],
		[
			'uniqueItems, minItems, maxItems',
			() =>
				mutate((s) => {
					props(s).c!.uniqueItems = true;
					props(s).c!.minItems = 1;
					props(s).c!.maxItems = 9;
				}),
		],
		[
			'enumTitles and enumSuggestedValues',
			() =>
				mutate((s) => {
					props(s).d!.enumTitles = ['Ex', 'Why'];
					props(s).d!.enumSuggestedValues = ['x', 'y', 'z'];
				}),
		],
		[
			'integer -> number',
			() =>
				mutate((s) => {
					props(s).b!.type = 'number';
				}),
		],
		[
			'reordered properties',
			() =>
				mutate((s) => {
					const p = props(s);
					s.properties = { e: p.e!, d: p.d!, c: p.c!, b: p.b!, a: p.a! };
				}),
		],
		[
			'reordered enum',
			() =>
				mutate((s) => {
					props(s).d!.enum = ['y', 'x'];
				}),
		],
		[
			'duplicated enum member',
			() =>
				mutate((s) => {
					props(s).d!.enum = ['x', 'y', 'x'];
				}),
		],
		[
			'type as a single-element array',
			() =>
				mutate((s) => {
					props(s).a!.type = ['string'];
				}),
		],
		[
			'duplicated type member',
			() =>
				mutate((s) => {
					props(s).a!.type = ['string', 'string'];
				}),
		],
		[
			'additionalProperties: {}',
			() =>
				mutate((s) => {
					s.additionalProperties = {};
				}),
		],
		[
			'additionalProperties: true',
			() =>
				mutate((s) => {
					s.additionalProperties = true;
				}),
		],
		[
			'$defs with no $ref',
			() =>
				mutate((s) => {
					s.$defs = { x: { type: 'number' } };
				}),
		],
		[
			'required naming an undeclared property',
			() =>
				mutate((s) => {
					s.required = ['a', 'ghost'];
				}),
		],
		[
			'an unrecognized keyword',
			() =>
				mutate((s) => {
					props(s).a!.someFutureKeyword = 42;
				}),
		],
	];

	test.each(cases)('%s', (_label, build) => {
		expect(hashOf(build())).toBe(hashOf(BASE));
	});

	test('declaration order in EmitOptions', () => {
		const forward: EmitOptions = {
			types: [
				{ name: 'A', variant: 'received' },
				{ name: 'B', variant: 'supplied' },
			],
		};
		const reversed: EmitOptions = {
			types: [
				{ name: 'B', variant: 'supplied' },
				{ name: 'A', variant: 'received' },
			],
		};
		expect(hashOf(BASE, forward)).toBe(hashOf(BASE, reversed));
	});

	test('unknownRoot, when the root is readable', () => {
		expect(hashOf(BASE, { ...OPTS, unknownRoot: 'record' })).toBe(hashOf(BASE, { ...OPTS, unknownRoot: 'unknown' }));
	});
});

describe('MUST move the hash', () => {
	const cases: [string, () => Schema][] = [
		[
			'added property',
			() =>
				mutate((s) => {
					props(s).f = { type: 'string' };
				}),
		],
		[
			'removed property',
			() =>
				mutate((s) => {
					delete props(s).a;
				}),
		],
		[
			'renamed property',
			() =>
				mutate((s) => {
					const p = props(s);
					s.properties = { renamed: p.a!, b: p.b!, c: p.c!, d: p.d!, e: p.e! };
				}),
		],
		[
			'newly required property',
			() =>
				mutate((s) => {
					s.required = ['a', 'b'];
				}),
		],
		[
			'no longer required',
			() =>
				mutate((s) => {
					s.required = [];
				}),
		],
		[
			'added default',
			() =>
				mutate((s) => {
					props(s).a!.default = 'x';
				}),
		],
		[
			'removed default',
			() =>
				mutate((s) => {
					delete props(s).b!.default;
				}),
		],
		[
			'changed type',
			() =>
				mutate((s) => {
					props(s).a!.type = 'number';
				}),
		],
		[
			'widened to nullable',
			() =>
				mutate((s) => {
					props(s).a!.type = ['string', 'null'];
				}),
		],
		[
			'changed array element type',
			() =>
				mutate((s) => {
					props(s).c!.items = { type: 'number' };
				}),
		],
		[
			'removed array items',
			() =>
				mutate((s) => {
					delete props(s).c!.items;
				}),
		],
		[
			'added enum member',
			() =>
				mutate((s) => {
					props(s).d!.enum = ['x', 'y', 'z'];
				}),
		],
		[
			'dropped enum for a bare string',
			() =>
				mutate((s) => {
					delete props(s).d!.enum;
				}),
		],
		[
			'additionalProperties: false',
			() =>
				mutate((s) => {
					s.additionalProperties = false;
				}),
		],
		[
			'additionalProperties as a subschema',
			() =>
				mutate((s) => {
					s.additionalProperties = { type: 'string' };
				}),
		],
		[
			'changed nested property',
			() =>
				mutate((s) => {
					props(props(s).e!).z!.type = 'number';
				}),
		],
		[
			'degraded by an unsupported keyword',
			() =>
				mutate((s) => {
					props(s).a!.oneOf = [];
				}),
		],
	];

	test.each(cases)('%s', (_label, build) => {
		expect(hashOf(build())).not.toBe(hashOf(BASE));
	});

	test('renamed declaration', () => {
		expect(hashOf(BASE, { types: [{ name: 'Renamed', variant: 'received' }] })).not.toBe(hashOf(BASE));
	});

	test('switched variant', () => {
		expect(hashOf(BASE, { types: [{ name: 'Input', variant: 'supplied' }] })).not.toBe(hashOf(BASE));
	});

	test('unknownRoot, when the root is unknown', () => {
		expect(hashOf(42, { ...OPTS, unknownRoot: 'record' })).not.toBe(hashOf(42, { ...OPTS, unknownRoot: 'unknown' }));
	});
});
