import { describe, expect, test } from 'vitest';

import { emit, header, type EmitOptions, type Variant } from '../../../../src/lib/schema-to-ts/emit.js';
import { HASH_LENGTH } from '../../../../src/lib/schema-to-ts/hash.js';
import { IR_VERSION, type IRNode, type IRProp, type IRRoot } from '../../../../src/lib/schema-to-ts/ir.js';

const str: IRNode = { kind: 'string' };
const num: IRNode = { kind: 'number' };
const nul: IRNode = { kind: 'null' };

const prop = (name: string, node: IRNode = str, extra: Partial<IRProp> = {}): IRProp => ({
	name,
	node,
	required: false,
	hasDefault: false,
	...extra,
});

const wrap = (node: IRNode): IRRoot => ({ irVersion: IR_VERSION, root: node });
const obj = (props: IRProp[], extra: Partial<Extract<IRNode, { kind: 'object' }>> = {}): IRNode => ({
	kind: 'object',
	props,
	open: true,
	...extra,
});

/** Emits one declaration and returns just its body, which is what most assertions care about. */
function body(node: IRNode, variant: Variant = 'received', opts: Partial<EmitOptions> = {}): string {
	const text = emit(wrap(node), { types: [{ name: 'T', variant }], ...opts });
	return text
		.split('\n')
		.slice(2)
		.join('\n')
		.replace(/^export type T = /, '')
		.replace(/;\n*$/, '');
}

describe('header', () => {
	test('carries the version as a prefix and a 16-hex hash', () => {
		const text = emit(wrap(str), { types: [{ name: 'T', variant: 'received' }] });
		expect(text.split('\n')[0]).toMatch(
			new RegExp(`^// @generated schema-ts v${IR_VERSION}-[0-9a-f]{${HASH_LENGTH}} — do not edit$`),
		);
	});

	test('is built from the same helper the checker will parse', () => {
		expect(header('abc')).toBe(`// @generated schema-ts v${IR_VERSION}-abc — do not edit`);
	});

	test('appears exactly once no matter how many declarations there are', () => {
		const text = emit(wrap(obj([prop('a')])), {
			types: [
				{ name: 'A', variant: 'received' },
				{ name: 'B', variant: 'supplied' },
			],
		});
		expect(text.split('\n').filter((l) => l.startsWith('// @generated'))).toHaveLength(1);
	});
});

describe('declarations', () => {
	test('emit in EmitOptions order, not sorted order', () => {
		const text = emit(wrap(str), {
			types: [
				{ name: 'Zeta', variant: 'received' },
				{ name: 'Alpha', variant: 'supplied' },
			],
		});
		expect(text).toContain('export type Zeta = string;\n\nexport type Alpha = string;');
	});

	test('always `type`, never `interface`', () => {
		const text = emit(wrap(obj([prop('a')])), { types: [{ name: 'T', variant: 'received' }] });
		expect(text).toContain('export type T = {');
		expect(text).not.toContain('interface');
	});

	test('file ends with a newline', () => {
		const result = emit(wrap(str), { types: [{ name: 'T', variant: 'received' }] });
		expect(result).toMatch(/;\n$/);
	});
});

describe('variance', () => {
	const node = obj([
		prop('req', str, { required: true }),
		prop('defaulted', str, { hasDefault: true }),
		prop('plain', str),
		prop('both', str, { required: true, hasDefault: true }),
	]);

	test('received treats platform-materialized defaults as present', () => {
		expect(body(node, 'received')).toBe(
			[
				'{',
				'    req: string;',
				'    defaulted: string;',
				'    plain?: string | undefined;',
				'    both: string;',
				'}',
			].join('\n'),
		);
	});

	test('supplied only demands what is required', () => {
		expect(body(node, 'supplied')).toBe(
			[
				'({',
				'    req: string;',
				'    defaulted?: string | undefined;',
				'    plain?: string | undefined;',
				'    both: string;',
				'} & Record<string, unknown>)',
			].join('\n'),
		);
	});

	test('supplied opens objects for extras; received closes them so typos are caught', () => {
		expect(body(obj([prop('a')], { open: true }), 'supplied')).toContain('& Record<string, unknown>');
		expect(body(obj([prop('a')], { open: true }), 'received')).not.toContain('Record');
	});

	test('a closed object is closed to the writer too', () => {
		expect(body(obj([prop('a')], { open: false }), 'supplied')).not.toContain('Record');
	});

	test('variance recurses into nested objects', () => {
		const nested = obj([prop('outer', obj([prop('inner', str, { hasDefault: true })]), { required: true })]);
		expect(body(nested, 'received')).toContain('inner: string;');
		expect(body(nested, 'supplied')).toContain('inner?: string | undefined;');
	});
});

describe('objects', () => {
	test('a propertyless open object is a Record, never a bare {}', () => {
		expect(body(obj([]))).toBe('Record<string, unknown>');
	});

	test('a propertyless closed object admits no keys at all', () => {
		expect(body(obj([], { open: false }))).toBe('Record<string, never>');
	});

	test('a dictionary types its values', () => {
		expect(body(obj([], { valueType: num }))).toBe('Record<string, number>');
	});

	test('a dictionary with declared properties is an intersection', () => {
		expect(body(obj([prop('x')], { valueType: num }))).toBe(
			['({', '    x?: string | undefined;', '} & Record<string, number>)'].join('\n'),
		);
	});

	test('a typed value overrides the open-object index signature', () => {
		expect(body(obj([prop('x')], { valueType: num }), 'supplied')).not.toContain('Record<string, unknown>');
	});

	test('never emits a bare {}', () => {
		for (const variant of ['received', 'supplied'] as const) {
			expect(body(obj([]), variant)).not.toBe('{}');
			expect(body(obj([], { open: false }), variant)).not.toBe('{}');
		}
	});

	test('indents nested objects by four spaces per level', () => {
		expect(body(obj([prop('a', obj([prop('b', obj([prop('c')]))]))]))).toBe(
			[
				'{',
				'    a?: {',
				'        b?: {',
				'            c?: string | undefined;',
				'        } | undefined;',
				'    } | undefined;',
				'}',
			].join('\n'),
		);
	});
});

describe('property names', () => {
	test('are bare when they are TypeScript identifiers', () => {
		for (const name of ['plain', '_leading', '$dollar', 'fbid_v2', 'A1', 'class', 'default', 'new']) {
			expect(body(obj([prop(name, str, { required: true })]))).toContain(`    ${name}: string;`);
		}
	});

	test('are quoted and escaped when they are not', () => {
		expect(body(obj([prop('not-an-ident', str, { required: true })]))).toContain('"not-an-ident": string;');
		expect(body(obj([prop('2fa', str, { required: true })]))).toContain('"2fa": string;');
		expect(body(obj([prop('has space', str, { required: true })]))).toContain('"has space": string;');
		expect(body(obj([prop('has "quotes"', str, { required: true })]))).toContain('"has \\"quotes\\"": string;');
		expect(body(obj([prop('back\\slash', str, { required: true })]))).toContain('"back\\\\slash": string;');
	});
});

describe('nodes', () => {
	test('scalars', () => {
		expect(body(str)).toBe('string');
		expect(body(num)).toBe('number');
		expect(body({ kind: 'boolean' })).toBe('boolean');
		expect(body(nul)).toBe('null');
		expect(body({ kind: 'unknown' })).toBe('unknown');
	});

	test('literals keep their JSON type', () => {
		expect(body({ kind: 'literal', value: 'posts' })).toBe('"posts"');
		expect(body({ kind: 'literal', value: 1 })).toBe('1');
		expect(body({ kind: 'literal', value: true })).toBe('true');
	});

	test('unions emit in authored order — only the hash sorts', () => {
		expect(body({ kind: 'union', members: [str, nul] })).toBe('string | null');
		expect(body({ kind: 'union', members: [nul, str] })).toBe('null | string');
	});

	test('arrays are always Array<T>, so no element ever needs parenthesizing', () => {
		expect(body({ kind: 'array', items: str })).toBe('Array<string>');
		expect(body({ kind: 'array', items: { kind: 'union', members: [str, nul] } })).toBe('Array<string | null>');
		expect(body({ kind: 'array', items: { kind: 'array', items: num } })).toBe('Array<Array<number>>');
	});

	test('an unknown property is not widened with | undefined', () => {
		expect(body(obj([prop('a', { kind: 'unknown' })]))).toContain('a?: unknown;');
	});
});

describe('unknown root', () => {
	test('is the truth by default', () => {
		expect(body({ kind: 'unknown' })).toBe('unknown');
	});

	test('can be softened to a Record on request', () => {
		expect(body({ kind: 'unknown' }, 'received', { unknownRoot: 'record' })).toBe('Record<string, unknown>');
	});

	test('the softer guess changes the hash, so the two are not interchangeable', () => {
		const ir = wrap({ kind: 'unknown' });
		const types: EmitOptions['types'] = [{ name: 'T', variant: 'received' }];
		expect(emit(ir, { types }).split('\n')[0]).not.toBe(emit(ir, { types, unknownRoot: 'record' }).split('\n')[0]);
	});
});

/**
 * The contract the emitter is written against, as a consumer would compile our output — not this
 * repo's tsconfig.json, which is about compiling *our* source and answers to a different audience.
 * Pinned on purpose: `exactOptionalPropertyTypes` is why we emit `name?: T | undefined` at all, so
 * if someone relaxed it at the repo root to unblock a src file, this gate must keep asserting it
 * rather than silently stop testing the thing it exists for. `types: []` proves generated output
 * stands alone with no ambient @types on the machine.
 */
const GATE_TSCONFIG = JSON.stringify(
	{
		compilerOptions: {
			noEmit: true,
			strict: true,
			exactOptionalPropertyTypes: true,
			target: 'esnext',
			module: 'nodenext',
			moduleResolution: 'nodenext',
			allowImportingTsExtensions: true,
			skipLibCheck: true,
			types: [],
		},
		include: ['*.ts'],
	},
	null,
	4,
);
