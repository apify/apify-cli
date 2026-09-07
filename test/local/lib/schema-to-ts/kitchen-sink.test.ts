// oxlint-disable import/default -- `?raw` is a Vite import; the rule resolves it to the .ts file and finds no default.
import { describe, expect, test } from 'vitest';

import {
	check,
	compile,
	normalizeInputSchema,
	type CompileOptions,
	type Diagnostic,
} from '../../../../src/lib/schema-to-ts/index.js';
import { significant, tally } from '../../../__setup__/schema-to-ts.js';
import kitchenSinkExpected from '../../__fixtures__/lib/schema-to-ts/expected/kitchen-sink.ts?raw';
import kitchenSink from '../../__fixtures__/lib/schema-to-ts/kitchen-sink.json' with { type: 'json' };

/**
 * One schema, every construct. compile.test.ts owns the claim that real Actor schemas survive
 * the pipeline; this file owns the claim that we know *exactly* which constructs we handle,
 * which we refuse loudly, and which we drop without saying a word.
 *
 * The tables below are the authored expectations — a row per construct, stating the type it
 * must produce. The checked-in `expected/kitchen-sink.ts` is only the regression net: it is the
 * compiler's own output, so it can prove nothing changed, never that anything is right.
 *
 * Adding a construct means adding a row. Closing a gap means *moving* a row between tables,
 * which is the point: `SILENT` failing because a diagnostic appeared is good news that has to
 * be written down.
 */
const OPTS: CompileOptions = {
	types: [
		{ name: 'KitchenSink', variant: 'received' },
		{ name: 'KitchenSinkArgs', variant: 'supplied' },
	],
};

const schema = normalizeInputSchema(kitchenSink);
const result = compile(schema, OPTS);

/** The two declarations, split so a row can say which variant it is talking about. */
const [received, supplied] = (() => {
	const parts = result.source.split('export type ');
	if (parts.length !== 3) throw new Error(`expected two declarations, got ${parts.length - 1}`);
	return [parts[1]!, parts[2]!];
})();

/** Emitter indentation is 4 spaces; rows quote the line, not its position. */
function line(text: string): string {
	return `\n    ${text}\n`;
}

/**
 * Constructs we handle. `supplied` is only spelled out when the two variants differ — that
 * difference is the whole reason there are two of them.
 */
const SUPPORTED: { feature: string; received: string; supplied?: string }[] = [
	{ feature: 'string', received: 'aString: string;' },
	{ feature: 'number', received: 'aNumber?: number | undefined;' },
	{
		feature: 'integer collapses to number, since TypeScript has no integer',
		received: 'anInteger?: number | undefined;',
	},
	{ feature: 'boolean', received: 'aBoolean?: boolean | undefined;' },
	{ feature: 'null is a type of its own', received: 'aNull?: null | undefined;' },
	{ feature: 'editor, isSecret and friends carry no type meaning', received: 'aSecret?: string | undefined;' },
	{
		feature: 'a type array becomes a union, in declared order',
		received: 'multiType?: string | number | boolean | null | undefined;',
	},
	{ feature: 'repeated types collapse', received: 'repeatedType?: string | number | undefined;' },
	{ feature: 'the nullable shorthand widens the type', received: 'nullableString?: string | null | undefined;' },
	{ feature: 'nullable: false is a no-op', received: 'notNullableString?: string | undefined;' },
	{ feature: 'nullable is idempotent', received: 'alreadyNullable?: string | null | undefined;' },
	{
		feature: 'an enum becomes a literal union',
		received: 'stringEnum?: "cheerio" | "puppeteer" | "playwright" | undefined;',
	},
	{ feature: 'a numeric enum keeps its numbers', received: 'numberEnum?: 1 | 2 | 3 | undefined;' },
	{
		feature: 'strings, numbers, booleans and null mix in one enum',
		received: 'mixedEnum?: "auto" | 42 | true | null | undefined;',
	},
	{ feature: 'a one-member enum is a literal, not a union', received: 'singleMemberEnum?: "only" | undefined;' },
	{ feature: 'repeated enum members collapse', received: 'repeatedEnumMembers?: "a" | "b" | undefined;' },
	{
		feature: 'enum wins over a conflicting type',
		received: 'enumOverridesType?: "not" | "boolean" | "at" | "all" | undefined;',
	},
	{
		feature: 'an array with no items is Array<unknown>, not Array<any>',
		received: 'arrayWithoutItems?: Array<unknown> | undefined;',
	},
	{ feature: 'items types the elements', received: 'arrayOfStrings?: Array<string> | undefined;' },
	{ feature: 'arrays nest', received: 'arrayOfArrays?: Array<Array<number>> | undefined;' },
	{ feature: 'an enum inside items', received: 'arrayOfEnums?: Array<"a" | "b"> | undefined;' },
	{
		feature: 'Array<T> always, so a union element never needs parenthesizing',
		received: 'arrayOfUnions?: Array<string | number> | undefined;',
	},
	{ feature: 'array inferred from items alone', received: 'inferredArray?: Array<string> | undefined;' },
	{
		feature: 'typed extras with no properties are a plain Record',
		received: 'recordOfNumbers?: Record<string, number> | undefined;',
	},
	{
		feature: 'a propertyless object is never a bare {}, which in TypeScript admits 5',
		received: 'propertylessObject?: Record<string, unknown> | undefined;',
	},
	{
		feature: 'closed and empty accepts no key at all',
		received: 'closedPropertylessObject?: Record<string, never> | undefined;',
	},
	{ feature: 'required and defaulted is present for both variants', received: 'requiredWithDefault: string;' },
	{
		feature: 'the platform materializes a default, so the reader has it and the writer need not send it',
		received: 'optionalWithDefault: number;',
		supplied: 'optionalWithDefault?: number | undefined;',
	},
	{
		feature: 'optional with no default is ? and | undefined, for exactOptionalPropertyTypes',
		received: 'optionalWithoutDefault?: string | undefined;',
	},
	{ feature: 'unknown already admits undefined, so it is not widened again', received: 'optionalUnknown?: unknown;' },
	{ feature: '{} is faithfully unknown', received: 'emptySchema?: unknown;' },
	{ feature: 'a non-identifier key is quoted', received: '"with-dash"?: string | undefined;' },
	{ feature: 'a leading digit is quoted', received: '"2fa"?: boolean | undefined;' },
	{ feature: 'a reserved word is a legal property name, so it stays bare', received: 'class?: string | undefined;' },
	{
		feature: '$ and _ are identifier characters, so they need no quoting',
		received: '$dollar_and_underscore?: string | undefined;',
	},
	{ feature: 'the empty key is legal, and quoting is the only way to emit it', received: '""?: string | undefined;' },
];

/**
 * Constructs we refuse, loudly. Every row is well-formed JSON Schema we could express and do
 * not, so every row degrades to `unknown` *and* says so. `path` is the JSON Pointer a CLI
 * prints, which is why the pointer escaping has a row of its own.
 */
const WARNED: { feature: string; path: string; code: string; message: string; emitted: string }[] = [
	{
		feature: '$ref, even to a definition this very schema spells out',
		path: '/properties/refToDefs',
		code: 'unsupported-keyword',
		message: '$ref is not supported yet',
		emitted: 'refToDefs?: unknown;',
	},
	{
		feature: '$ref degrades the whole node, sibling type and properties included',
		path: '/properties/refWithSiblings',
		code: 'unsupported-keyword',
		message: '$ref is not supported yet',
		emitted: 'refWithSiblings?: unknown;',
	},
	{
		feature: 'a $ref inside items — the array around it survives',
		path: '/properties/arrayOfRefs/items',
		code: 'unsupported-keyword',
		message: '$ref is not supported yet',
		emitted: 'arrayOfRefs?: Array<unknown> | undefined;',
	},
	{
		feature: 'oneOf, an exclusive union',
		path: '/properties/oneOfBranch',
		code: 'unsupported-keyword',
		message: 'oneOf is not supported yet',
		emitted: 'oneOfBranch?: unknown;',
	},
	{
		feature: 'anyOf, a plain union',
		path: '/properties/anyOfBranch',
		code: 'unsupported-keyword',
		message: 'anyOf is not supported yet',
		emitted: 'anyOfBranch?: unknown;',
	},
	{
		feature: 'allOf, an intersection',
		path: '/properties/allOfBranch',
		code: 'unsupported-keyword',
		message: 'allOf is not supported yet',
		emitted: 'allOfBranch?: unknown;',
	},
	{
		feature: 'not, which has no TypeScript equivalent at all',
		path: '/properties/notBranch',
		code: 'unsupported-keyword',
		message: 'not is not supported yet',
		emitted: 'notBranch?: unknown;',
	},
	{
		feature: 'if / then / else, reported as one warning naming all three',
		path: '/properties/conditional',
		code: 'unsupported-keyword',
		message: 'if, then, else is not supported yet',
		emitted: 'conditional?: unknown;',
	},
	{
		feature: 'patternProperties, a template literal key type',
		path: '/properties/patternKeys',
		code: 'unsupported-keyword',
		message: 'patternProperties is not supported yet',
		emitted: 'patternKeys?: unknown;',
	},
	{
		feature: 'positional items — a tuple is still an array, so Array<unknown> is sound',
		path: '/properties/tupleItems/items',
		code: 'unsupported-tuple-items',
		message: 'positional `items` is not supported yet',
		emitted: 'tupleItems?: Array<unknown> | undefined;',
	},
	{
		feature: 'an enum of objects cannot be written as a literal',
		path: '/properties/objectEnum/enum',
		code: 'unsupported-enum-values',
		message: '`enum` holding an object cannot be expressed as a literal',
		emitted: 'objectEnum?: unknown;',
	},
	{
		feature: 'an enum of arrays, same reason',
		path: '/properties/arrayEnum/enum',
		code: 'unsupported-enum-values',
		message: '`enum` holding an array cannot be expressed as a literal',
		emitted: 'arrayEnum?: unknown;',
	},
	{
		feature: 'the pointer escapes / and ~ per RFC 6901, so the path stays machine-usable',
		path: '/properties/escaped~1key~0with~0specials',
		code: 'unsupported-keyword',
		message: '$ref is not supported yet',
		emitted: '"escaped/key~with~specials"?: unknown;',
	},
];

/**
 * Constructs we drop in silence. These are the rows that hurt: the type is wrong-ish and
 * nothing tells the user. `lost` is prose on purpose — there is no code to assert against,
 * which is precisely the defect.
 */
const SILENT: { feature: string; property: string; lost: string; received: string }[] = [
	{
		feature: 'nullable next to an enum',
		property: 'nullableEnum',
		lost: 'null — enum wins over type, and the widened type never reaches the enum branch',
		received: 'nullableEnum?: "a" | "b" | undefined;',
	},
	{
		feature: 'const',
		property: 'constString',
		lost: 'the literal "fixed", which is exactly what a one-member enum would have given us',
		received: 'constString?: string | undefined;',
	},
	{
		feature: 'prefixItems, the 2020-12 tuple syntax',
		property: 'prefixItemsTuple',
		lost: '[string, number] — and unlike positional `items`, not even a warning',
		received: 'prefixItemsTuple?: Array<unknown> | undefined;',
	},
	{
		feature: 'propertyNames',
		property: 'constrainedKeys',
		lost: 'the key constraint; the key type stays string',
		received: 'constrainedKeys?: Record<string, string> | undefined;',
	},
	{
		feature: 'contains',
		property: 'containsANumber',
		lost: 'the element constraint; with no `items` the array is Array<unknown>',
		received: 'containsANumber?: Array<unknown> | undefined;',
	},
	{
		feature: 'readOnly',
		property: 'readOnlyValue',
		lost: 'the readonly modifier',
		received: 'readOnlyValue?: string | undefined;',
	},
	{
		feature: 'deprecated',
		property: 'deprecatedValue',
		lost: 'a @deprecated tag, which needs doc comments the emitter does not write',
		received: 'deprecatedValue?: string | undefined;',
	},
];

describe('the whole fixture', () => {
	test('compiles to the checked-in TypeScript', () => {
		expect(significant(result.source)).toBe(significant(kitchenSinkExpected));
	});

	test('and that comparison has teeth — a schema that moved does not pass it', () => {
		const root = schema as { properties: Record<string, unknown> };
		const moved = { ...root, properties: { ...root.properties, addedLater: { type: 'string' } } };
		expect(significant(compile(moved, OPTS).source)).not.toBe(significant(kitchenSinkExpected));
	});

	test('check reads the formatted file as current — the fingerprint outlives the formatter', () => {
		expect(check(kitchenSinkExpected, schema, OPTS)).toMatchObject({ stale: false, reason: 'match' });
	});

	test('nothing here is malformed, so no construct produces an error', () => {
		expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
	});
});

describe('supported: $feature', () => {
	test.each(SUPPORTED)('$feature', ({ received: expected, supplied: expectedSupplied }) => {
		expect(received).toContain(line(expected));
		expect(supplied).toContain(line(expectedSupplied ?? expected));
	});
});

describe('unsupported, and warned about: $feature', () => {
	test.each(WARNED)('$feature', ({ emitted }) => {
		expect(received).toContain(line(emitted));
	});

	test('every warning, at the exact pointer, and no others', () => {
		expect(result.diagnostics.map(({ severity, path, code, message }) => ({ severity, path, code, message }))).toEqual(
			WARNED.map(({ path, code, message }): Diagnostic => ({ severity: 'warning', path, code, message }) as Diagnostic),
		);
	});
});

describe('unsupported, and not warned about: $feature', () => {
	test.each(SILENT)('$feature', ({ property, received: expected }) => {
		expect(received).toContain(line(expected));
		// The defect, stated as an assertion: no diagnostic and no notice names this property.
		// When one starts to, move the row into WARNED — this failing is good news.
		expect(result.diagnostics.filter((d) => d.path.includes(property))).toEqual([]);
		expect(result.notices.filter((n) => n.path.includes(property))).toEqual([]);
	});
});

describe('what the two variants disagree about', () => {
	test('an open object lets the writer add keys and the reader read none', () => {
		expect(received).toContain(
			['    openObject?: {', '        a?: string | undefined;', '    } | undefined;'].join('\n'),
		);
		expect(supplied).toContain(
			['    openObject?: ({', '        a?: string | undefined;', '    } & Record<string, unknown>) | undefined;'].join(
				'\n',
			),
		);
	});

	test('additionalProperties: false closes the object for the writer too', () => {
		for (const variant of [received, supplied]) {
			expect(variant).toContain(['    closedObject: {', '        a: string;', '    };'].join('\n'));
		}
	});

	test('additionalProperties: true and {} say what silence already said', () => {
		for (const property of ['explicitlyOpenObject', 'emptyAdditionalProperties']) {
			expect(received).toContain(`    ${property}?: {\n`);
			expect(supplied).toContain(`    ${property}?: ({\n`);
		}
	});

	test('declared properties plus typed extras is a literal intersected with a Record', () => {
		for (const variant of [received, supplied]) {
			expect(variant).toContain(
				[
					'    objectWithTypedExtras?: ({',
					'        known: string;',
					'    } & Record<string, number>) | undefined;',
				].join('\n'),
			);
		}
	});

	test('the root object is open, so only the writer gets the escape hatch', () => {
		expect(received.trimEnd().endsWith('};')).toBe(true);
		expect(supplied.trimEnd().endsWith('} & Record<string, unknown>);')).toBe(true);
	});

	test('indentation survives objects inside arrays inside objects', () => {
		expect(received).toContain(
			[
				'    deeplyNested: {',
				'        level1: {',
				'            level2: Array<{',
				'                leaf: string;',
				'            }>;',
				'        };',
				'    };',
			].join('\n'),
		);
	});

	test('nullable applies to the array, not to its items', () => {
		expect(received).toContain(
			[
				'    nullableArrayOfObjects?: Array<{',
				'        id: number;',
				'        label?: string | null | undefined;',
				'    }> | null | undefined;',
			].join('\n'),
		);
	});

	test('a nullable inferred object keeps its shape inside the union', () => {
		expect(received).toContain(
			['    nullableInferredObject?: {', '        x?: string | undefined;', '    } | null | undefined;'].join('\n'),
		);
	});

	test('unevaluatedProperties: false is ignored, so the writer still gets the escape hatch', () => {
		expect(supplied).toContain(
			[
				'    unevaluatedExtras?: ({',
				'        a?: string | undefined;',
				'    } & Record<string, unknown>) | undefined;',
			].join('\n'),
		);
		expect(result.diagnostics.filter((d) => d.path.includes('unevaluatedExtras'))).toEqual([]);
	});

	test('dependentRequired is ignored, so both keys stay independently optional', () => {
		for (const variant of [received, supplied]) {
			expect(variant).toContain(
				['        card?: string | undefined;', '        billingAddress?: string | undefined;'].join('\n'),
			);
		}
		expect(result.diagnostics.filter((d) => d.path.includes('dependentKeys'))).toEqual([]);
	});
});

describe('$defs', () => {
	test('is not itself a diagnostic — without a $ref it is dead weight, and with one the $ref is the warning', () => {
		expect(result.diagnostics.filter((d) => d.path.includes('$defs'))).toEqual([]);
		expect(result.notices.filter((n) => n.path.includes('$defs'))).toEqual([]);
	});

	test('is never read, so nothing it declares reaches the output', () => {
		expect(result.source).not.toContain('street');
		expect(result.source).not.toContain('city');
	});
});

describe('notices — schema lint with no type impact', () => {
	test('exactly the ones the fixture asks for', () => {
		expect(result.notices.map(({ path, code }) => `${path} ${code}`)).toEqual([
			'/properties/optionalUnknown empty-schema',
			'/properties/emptySchema empty-schema',
			'/required required-unknown-property',
		]);
	});

	test('a required name with no property is a notice, and does not invent the property', () => {
		expect(result.source).not.toContain('ghostProperty');
	});
});

describe('the fidelity ledger', () => {
	test('adds up to exactly what the tables above claim', () => {
		expect(tally(result.diagnostics)).toEqual({
			'unsupported-keyword': WARNED.filter((w) => w.code === 'unsupported-keyword').length,
			'unsupported-tuple-items': 1,
			'unsupported-enum-values': 2,
		});
		expect(tally(result.notices)).toEqual({ 'empty-schema': 2, 'required-unknown-property': 1 });
	});
});
