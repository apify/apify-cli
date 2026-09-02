import { describe, expect, test } from 'vitest';

import { UNKNOWN, nodeKey, union, type IRNode } from '../../../../src/lib/schema-to-ts/ir.js';

const str: IRNode = { kind: 'string' };
const num: IRNode = { kind: 'number' };
const nul: IRNode = { kind: 'null' };

describe('nodeKey', () => {
	test('separates literals of different types that stringify the same', () => {
		expect(nodeKey({ kind: 'literal', value: 1 })).not.toBe(nodeKey({ kind: 'literal', value: '1' }));
		expect(nodeKey({ kind: 'literal', value: true })).not.toBe(nodeKey({ kind: 'literal', value: 'true' }));
	});

	test('is stable for structurally identical nodes', () => {
		const a: IRNode = {
			kind: 'object',
			props: [{ name: 'a', node: str, required: true, hasDefault: false }],
			open: true,
		};
		const b: IRNode = {
			kind: 'object',
			props: [{ name: 'a', node: str, required: true, hasDefault: false }],
			open: true,
		};
		expect(nodeKey(a)).toBe(nodeKey(b));
	});

	test('distinguishes required, hasDefault, open, and valueType', () => {
		const base = { name: 'a', node: str, required: false, hasDefault: false };
		const obj = (props: (typeof base)[], extra: Partial<Extract<IRNode, { kind: 'object' }>> = {}): IRNode => ({
			kind: 'object',
			props,
			open: true,
			...extra,
		});
		const keys = new Set([
			nodeKey(obj([base])),
			nodeKey(obj([{ ...base, required: true }])),
			nodeKey(obj([{ ...base, hasDefault: true }])),
			nodeKey(obj([base], { open: false })),
			nodeKey(obj([base], { valueType: num })),
		]);
		expect(keys.size).toBe(5);
	});

	test('distinguishes property order', () => {
		const p = (name: string) => ({ name, node: str, required: false, hasDefault: false });
		expect(nodeKey({ kind: 'object', props: [p('a'), p('b')], open: true })).not.toBe(
			nodeKey({ kind: 'object', props: [p('b'), p('a')], open: true }),
		);
	});

	test('descends into arrays and unions', () => {
		expect(nodeKey({ kind: 'array', items: str })).not.toBe(nodeKey({ kind: 'array', items: num }));
		expect(nodeKey({ kind: 'union', members: [str, nul] })).not.toBe(nodeKey({ kind: 'union', members: [num, nul] }));
	});
});

describe('union', () => {
	test('empty collapses to unknown', () => {
		expect(union([])).toEqual(UNKNOWN);
	});

	test('single member collapses to that member', () => {
		expect(union([str])).toEqual(str);
	});

	test('preserves authored order — the emitter reproduces it', () => {
		expect(union([nul, str])).toEqual({ kind: 'union', members: [nul, str] });
		expect(union([str, nul])).toEqual({ kind: 'union', members: [str, nul] });
	});

	test('de-dupes structurally identical members', () => {
		expect(union([str, str])).toEqual(str);
		expect(union([str, nul, str])).toEqual({ kind: 'union', members: [str, nul] });
	});

	test('keeps literals that differ only by type', () => {
		const one: IRNode = { kind: 'literal', value: 1 };
		const oneStr: IRNode = { kind: 'literal', value: '1' };
		expect(union([one, oneStr])).toEqual({ kind: 'union', members: [one, oneStr] });
	});

	test('flattens nested unions', () => {
		expect(union([{ kind: 'union', members: [str, nul] }, num])).toEqual({
			kind: 'union',
			members: [str, nul, num],
		});
	});

	test('unknown absorbs the rest, matching TS semantics for `string | unknown`', () => {
		expect(union([str, UNKNOWN])).toEqual(UNKNOWN);
		expect(union([UNKNOWN, str, nul])).toEqual(UNKNOWN);
	});
});
