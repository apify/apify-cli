import { describe, expect, test } from 'vitest';

import { canonical, canonicalNode, canonicalOptions } from '../../../../src/lib/schema-to-ts/canonical.js';
import type { EmitOptions } from '../../../../src/lib/schema-to-ts/emit.js';
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

const root = (node: IRNode): IRRoot => ({ irVersion: IR_VERSION, root: node });
const opts = (types: EmitOptions['types']): EmitOptions => ({ types });

describe('canonicalNode', () => {
	test('sorts object properties, so reordering cannot move the hash', () => {
		const a: IRNode = { kind: 'object', props: [prop('a'), prop('b')], open: true };
		const b: IRNode = { kind: 'object', props: [prop('b'), prop('a')], open: true };
		expect(canonicalNode(a)).toBe(canonicalNode(b));
	});

	test('sorts union members by kind rank, so reordering cannot move the hash', () => {
		expect(canonicalNode({ kind: 'union', members: [str, nul] })).toBe(
			canonicalNode({ kind: 'union', members: [nul, str] }),
		);
	});

	test('still separates unions of different members', () => {
		expect(canonicalNode({ kind: 'union', members: [str, nul] })).not.toBe(
			canonicalNode({ kind: 'union', members: [num, nul] }),
		);
	});

	test('separates literals that differ only by type', () => {
		expect(canonicalNode({ kind: 'literal', value: 1 })).not.toBe(canonicalNode({ kind: 'literal', value: '1' }));
	});

	test('sorts same-rank literals deterministically', () => {
		const lit = (value: string): IRNode => ({ kind: 'literal', value });
		expect(canonicalNode({ kind: 'union', members: [lit('a'), lit('b')] })).toBe(
			canonicalNode({ kind: 'union', members: [lit('b'), lit('a')] }),
		);
	});

	test('escapes property names so separators in a name cannot forge structure', () => {
		const tricky: IRNode = { kind: 'object', props: [prop('a,"b":-,'), prop('c')], open: true };
		const forged: IRNode = { kind: 'object', props: [prop('a'), prop('b'), prop('c')], open: true };
		expect(canonicalNode(tricky)).not.toBe(canonicalNode(forged));
	});

	test('distinguishes required, hasDefault, open and valueType', () => {
		const base: IRNode = { kind: 'object', props: [prop('a')], open: true };
		const keys = new Set([
			canonicalNode(base),
			canonicalNode({ kind: 'object', props: [prop('a', str, { required: true })], open: true }),
			canonicalNode({ kind: 'object', props: [prop('a', str, { hasDefault: true })], open: true }),
			canonicalNode({ kind: 'object', props: [prop('a')], open: false }),
			canonicalNode({ kind: 'object', props: [prop('a')], valueType: num, open: true }),
		]);
		expect(keys.size).toBe(5);
	});

	test('descends into arrays', () => {
		expect(canonicalNode({ kind: 'array', items: str })).not.toBe(canonicalNode({ kind: 'array', items: num }));
	});
});

describe('canonicalOptions', () => {
	test('sorts declarations by name — the CLI config order is not load-bearing', () => {
		expect(
			canonicalOptions(
				opts([
					{ name: 'A', variant: 'received' },
					{ name: 'B', variant: 'supplied' },
				]),
			),
		).toBe(
			canonicalOptions(
				opts([
					{ name: 'B', variant: 'supplied' },
					{ name: 'A', variant: 'received' },
				]),
			),
		);
	});

	test('names and variants are part of the identity', () => {
		const base = canonicalOptions(opts([{ name: 'A', variant: 'received' }]));
		expect(base).not.toBe(canonicalOptions(opts([{ name: 'B', variant: 'received' }])));
		expect(base).not.toBe(canonicalOptions(opts([{ name: 'A', variant: 'supplied' }])));
	});
});

describe('canonical', () => {
	test('omits the IR version — the header carries it as a prefix', () => {
		const ir = root(str);
		expect(canonical(ir, opts([{ name: 'A', variant: 'received' }]))).not.toContain(String(IR_VERSION));
	});

	test('unknownRoot counts only when the root is actually unknown', () => {
		const declarations = opts([{ name: 'A', variant: 'received' }]);
		const objectRoot = root({ kind: 'object', props: [prop('a')], open: true });
		expect(canonical(objectRoot, { ...declarations, unknownRoot: 'record' })).toBe(
			canonical(objectRoot, { ...declarations, unknownRoot: 'unknown' }),
		);

		const unknownRoot = root({ kind: 'unknown' });
		expect(canonical(unknownRoot, { ...declarations, unknownRoot: 'record' })).not.toBe(
			canonical(unknownRoot, { ...declarations, unknownRoot: 'unknown' }),
		);
	});
});
