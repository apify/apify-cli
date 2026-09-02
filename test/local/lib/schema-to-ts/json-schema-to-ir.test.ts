import { describe, expect, test } from 'vitest';

import { IR_VERSION, UNKNOWN, type IRNode, type IRProp } from '../../../../src/lib/schema-to-ts/ir.js';
import { jsonSchemaToIR, type Lifted } from '../../../../src/lib/schema-to-ts/json-schema-to-ir.js';

const str: IRNode = { kind: 'string' };
const num: IRNode = { kind: 'number' };
const bool: IRNode = { kind: 'boolean' };
const nul: IRNode = { kind: 'null' };

/** Lifts a single field so paths are predictably `/properties/f`. */
function field(schema: unknown): Lifted & { node: IRNode } {
	const lifted = jsonSchemaToIR({ type: 'object', properties: { f: schema } });
	return { ...lifted, node: propNode(lifted.ir.root, 'f') };
}

function props(node: IRNode): IRProp[] {
	if (node.kind !== 'object') throw new Error(`expected an object node, got ${node.kind}`);
	return node.props;
}

function propNode(node: IRNode, name: string): IRNode {
	const found = props(node).find((p) => p.name === name);
	if (!found) throw new Error(`no property ${name}`);
	return found.node;
}

/** `severity path code` triples — assert on these, not on message wording. */
function codes(lifted: Lifted): string[] {
	return lifted.diagnostics.map((d) => `${d.severity} ${d.path} ${d.code}`);
}

function noticeCodes(lifted: Lifted): string[] {
	return lifted.notices.map((n) => `${n.path} ${n.code}`);
}

function expectClean(lifted: Lifted): void {
	expect(codes(lifted)).toEqual([]);
	expect(noticeCodes(lifted)).toEqual([]);
}

describe('root', () => {
	test('stamps the IR version', () => {
		expect(jsonSchemaToIR({ type: 'string' }).ir.irVersion).toBe(IR_VERSION);
	});

	test('a non-object root degrades the whole tree', () => {
		for (const bad of [null, 'nope', 42, [], true]) {
			const lifted = jsonSchemaToIR(bad);
			expect(lifted.ir.root).toEqual(UNKNOWN);
			expect(codes(lifted)).toEqual(['error  malformed-schema']);
		}
	});

	test('a propertyless object is legal JSON Schema, not an error', () => {
		const lifted = jsonSchemaToIR({ type: 'object' });
		expect(lifted.ir.root).toEqual({ kind: 'object', props: [], open: true });
		expectClean(lifted);
	});
});

describe('primitives', () => {
	test('maps the scalar types', () => {
		expect(field({ type: 'string' }).node).toEqual(str);
		expect(field({ type: 'number' }).node).toEqual(num);
		expect(field({ type: 'boolean' }).node).toEqual(bool);
		expect(field({ type: 'null' }).node).toEqual(nul);
	});

	test('integer collapses to number, so integer<->number is not a type change', () => {
		expect(field({ type: 'integer' }).node).toEqual(num);
		expect(field({ type: ['integer', 'number'] }).node).toEqual(num);
	});
});

describe('type arrays', () => {
	test('become unions in authored order', () => {
		expect(field({ type: ['string', 'null'] }).node).toEqual({ kind: 'union', members: [str, nul] });
		expect(field({ type: ['null', 'string'] }).node).toEqual({ kind: 'union', members: [nul, str] });
	});

	test('de-dupe and collapse to a single node', () => {
		expect(field({ type: ['string', 'string'] }).node).toEqual(str);
		expect(field({ type: ['string'] }).node).toEqual(str);
	});

	test('a malformed member degrades the whole node', () => {
		const lifted = field({ type: ['string', 'object'], properties: 7 });
		expect(lifted.node).toEqual(UNKNOWN);
		expect(codes(lifted)).toEqual(['error /properties/f/properties malformed-properties']);
	});
});

describe('malformed type', () => {
	test('rejects a type that is not a string or array of strings', () => {
		const lifted = field({ type: 42 });
		expect(lifted.node).toEqual(UNKNOWN);
		expect(codes(lifted)).toEqual(['error /properties/f malformed-type']);
	});

	test('rejects a type name outside the seven JSON Schema types', () => {
		expect(codes(field({ type: 'strng' }))).toEqual(['error /properties/f unknown-type-name']);
		expect(codes(field({ type: ['string', 'strng'] }))).toEqual(['error /properties/f unknown-type-name']);
	});

	test('rejects an empty type array', () => {
		expect(codes(field({ type: [] }))).toEqual(['error /properties/f empty-type-array']);
	});
});

describe('absent type', () => {
	test('is inferred from properties, additionalProperties, or items', () => {
		expect(field({ properties: { x: { type: 'string' } } }).node.kind).toBe('object');
		expect(field({ additionalProperties: { type: 'string' } }).node.kind).toBe('object');
		expect(field({ items: { type: 'boolean' } }).node).toEqual({ kind: 'array', items: bool });
	});

	test('a bare {} is faithfully unknown — a notice, not a diagnostic', () => {
		const lifted = field({});
		expect(lifted.node).toEqual(UNKNOWN);
		expect(codes(lifted)).toEqual([]);
		expect(noticeCodes(lifted)).toEqual(['/properties/f empty-schema']);
	});
});

describe('enum', () => {
	test('wins over type and de-dupes', () => {
		const lifted = field({ type: ['string', 'null'], enum: ['x', 'y', 'x'] });
		expect(lifted.node).toEqual({
			kind: 'union',
			members: [
				{ kind: 'literal', value: 'x' },
				{ kind: 'literal', value: 'y' },
			],
		});
		expectClean(lifted);
	});

	test('mixes literal types and null', () => {
		expect(field({ enum: ['a', 1, true, null] }).node).toEqual({
			kind: 'union',
			members: [{ kind: 'literal', value: 'a' }, { kind: 'literal', value: 1 }, { kind: 'literal', value: true }, nul],
		});
	});

	test('a single member collapses to a bare literal', () => {
		expect(field({ enum: ['only'] }).node).toEqual({ kind: 'literal', value: 'only' });
	});

	test('objects and arrays cannot be literals', () => {
		const lifted = field({ enum: [{ x: 1 }] });
		expect(lifted.node).toEqual(UNKNOWN);
		expect(codes(lifted)).toEqual(['warning /properties/f/enum unsupported-enum-values']);
	});

	test('must be a non-empty array', () => {
		expect(codes(field({ enum: [] }))).toEqual(['error /properties/f/enum malformed-enum']);
		expect(codes(field({ enum: 'nope' }))).toEqual(['error /properties/f/enum malformed-enum']);
	});
});

describe('objects', () => {
	test('preserve authored property order and record required/hasDefault', () => {
		const lifted = jsonSchemaToIR({
			type: 'object',
			properties: {
				b: { type: 'string' },
				a: { type: 'string', default: 'x' },
				c: { type: 'string' },
			},
			required: ['a', 'c'],
		});
		expect(props(lifted.ir.root)).toEqual([
			{ name: 'b', node: str, required: false, hasDefault: false },
			{ name: 'a', node: str, required: true, hasDefault: true },
			{ name: 'c', node: str, required: true, hasDefault: false },
		]);
		expectClean(lifted);
	});

	test('nest, and paths point at the offending subschema', () => {
		const lifted = jsonSchemaToIR({
			type: 'object',
			properties: { outer: { type: 'object', properties: { inner: { type: 'strng' } } } },
		});
		expect(codes(lifted)).toEqual(['error /properties/outer/properties/inner unknown-type-name']);
		expect(propNode(propNode(lifted.ir.root, 'outer'), 'inner')).toEqual(UNKNOWN);
	});

	test('one malformed property does not take out its siblings', () => {
		const lifted = jsonSchemaToIR({
			type: 'object',
			properties: { good: { type: 'string' }, bad: 'not a schema', alsoGood: { type: 'number' } },
		});
		expect(props(lifted.ir.root)).toEqual([
			{ name: 'good', node: str, required: false, hasDefault: false },
			{ name: 'bad', node: UNKNOWN, required: false, hasDefault: false },
			{ name: 'alsoGood', node: num, required: false, hasDefault: false },
		]);
		expect(codes(lifted)).toEqual(['error /properties/bad malformed-schema']);
	});

	test('malformed properties or required degrade the object', () => {
		expect(codes(field({ type: 'object', properties: [] }))).toEqual([
			'error /properties/f/properties malformed-properties',
		]);
		expect(field({ type: 'object', properties: [] }).node).toEqual(UNKNOWN);

		expect(codes(field({ type: 'object', required: 'nope' }))).toEqual([
			'error /properties/f/required malformed-required',
		]);
		expect(codes(field({ type: 'object', required: [1] }))).toEqual([
			'error /properties/f/required malformed-required',
		]);
	});

	test('required naming an undeclared property is a notice with no type impact', () => {
		const lifted = jsonSchemaToIR({
			type: 'object',
			properties: { a: { type: 'string' } },
			required: ['a', 'ghost'],
		});
		expect(codes(lifted)).toEqual([]);
		expect(noticeCodes(lifted)).toEqual(['/required required-unknown-property']);
		expect(props(lifted.ir.root)).toHaveLength(1);
	});
});

describe('additionalProperties', () => {
	test('absent, {} and true are all open; false is closed', () => {
		expect(field({ type: 'object' }).node).toEqual({ kind: 'object', props: [], open: true });
		expect(field({ type: 'object', additionalProperties: {} }).node).toEqual({
			kind: 'object',
			props: [],
			open: true,
		});
		expect(field({ type: 'object', additionalProperties: true }).node).toEqual({
			kind: 'object',
			props: [],
			open: true,
		});
		expect(field({ type: 'object', additionalProperties: false }).node).toEqual({
			kind: 'object',
			props: [],
			open: false,
		});
	});

	test('a non-empty subschema types the extra keys', () => {
		expect(field({ type: 'object', additionalProperties: { type: 'string' } }).node).toEqual({
			kind: 'object',
			props: [],
			valueType: str,
			open: true,
		});
	});

	test('combines with declared properties', () => {
		expect(
			field({
				type: 'object',
				properties: { x: { type: 'string' } },
				additionalProperties: { type: 'number' },
			}).node,
		).toEqual({
			kind: 'object',
			props: [{ name: 'x', node: str, required: false, hasDefault: false }],
			valueType: num,
			open: true,
		});
	});

	test('must be a boolean or an object', () => {
		const lifted = field({ type: 'object', additionalProperties: 42 });
		expect(lifted.node).toEqual(UNKNOWN);
		expect(codes(lifted)).toEqual(['error /properties/f/additionalProperties malformed-additional-properties']);
	});

	test('reports inside the extra-key subschema at its own path', () => {
		expect(codes(field({ type: 'object', additionalProperties: { type: 'strng' } }))).toEqual([
			'error /properties/f/additionalProperties unknown-type-name',
		]);
	});
});

describe('arrays', () => {
	test('without items hold unknown', () => {
		const lifted = field({ type: 'array' });
		expect(lifted.node).toEqual({ kind: 'array', items: UNKNOWN });
		expectClean(lifted);
	});

	test('carry their element type', () => {
		expect(field({ type: 'array', items: { type: 'string' } }).node).toEqual({ kind: 'array', items: str });
	});

	test('a tuple degrades the element, not the array — a tuple is still an array', () => {
		const lifted = field({ type: 'array', items: [{ type: 'string' }] });
		expect(lifted.node).toEqual({ kind: 'array', items: UNKNOWN });
		expect(codes(lifted)).toEqual(['warning /properties/f/items unsupported-tuple-items']);
	});

	test('items that are neither object nor array degrade the array', () => {
		const lifted = field({ type: 'array', items: 7 });
		expect(lifted.node).toEqual(UNKNOWN);
		expect(codes(lifted)).toEqual(['error /properties/f/items malformed-items']);
	});
});

describe('unsupported keywords', () => {
	test.each(['oneOf', 'anyOf', 'allOf', 'not', 'if', 'then', 'else', '$ref', 'patternProperties'])(
		'%s degrades the node',
		(keyword) => {
			const lifted = field({ type: 'string', [keyword]: {} });
			expect(lifted.node).toEqual(UNKNOWN);
			expect(codes(lifted)).toEqual(['warning /properties/f unsupported-keyword']);
		},
	);

	test('reports every offending keyword in one diagnostic', () => {
		const lifted = field({ oneOf: [], allOf: [] });
		expect(codes(lifted)).toEqual(['warning /properties/f unsupported-keyword']);
		expect(lifted.diagnostics[0]!.message).toContain('oneOf, allOf');
	});

	test('$defs alone is dead weight, not a warning', () => {
		expectClean(field({ type: 'string', $defs: { x: { type: 'number' } } }));
	});
});

describe('extraneous keywords', () => {
	test('are ignored in total silence — the core never sees Apify sugar', () => {
		const lifted = field({
			type: 'string',
			title: 'A title',
			description: 'Prose <b>with HTML</b>',
			editor: 'textfield',
			prefill: 'x',
			example: 'y',
			pattern: '^a$',
			minLength: 1,
			maxLength: 9,
			isSecret: true,
			unit: 'ms',
			sectionCaption: 'Section',
			sectionDescription: 'More prose',
			enumTitles: ['One'],
			enumSuggestedValues: ['a', 'b'],
		});
		expect(lifted.node).toEqual(str);
		expectClean(lifted);
	});
});
