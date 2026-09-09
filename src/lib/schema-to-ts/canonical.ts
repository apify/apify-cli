import { type EmitOptions } from './emit.js';
import { type IRNode, type IRRoot } from './ir.js';

/**
 * Canonical serialization that feeds the hash. Purpose-written rather than JSON.stringify,
 * which would depend on key insertion order and on `undefined` vs absent — one refactor and
 * every hash in the wild would move.
 *
 * All collections are sorted here, while the emitter reproduces authored order. Reordering
 * properties or enum members therefore never reports drift: it cannot change the type.
 *
 * `irVersion` is deliberately absent — the header carries it as a prefix, outside the digest,
 * so a version mismatch is reportable instead of an opaque hash difference.
 */

/** `null` and `unknown` last so nothing about the ranking looks like emission order. */
const KIND_RANK: Record<IRNode['kind'], number> = {
	literal: 0,
	string: 1,
	number: 2,
	boolean: 3,
	array: 4,
	object: 5,
	null: 6,
	unknown: 7,
	// Unreachable: union() flattens, so a union is never a member of a union.
	union: 8,
};

/** UTF-16 code unit order. Never localeCompare — it is locale-dependent. */
function byCodeUnit(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

export function canonicalNode(node: IRNode): string {
	switch (node.kind) {
		case 'string':
			return 's';
		case 'number':
			return 'n';
		case 'boolean':
			return 'b';
		case 'null':
			return 'z';
		case 'unknown':
			return '?';
		case 'literal':
			return `l:${typeof node.value}:${JSON.stringify(node.value)}`;
		case 'array':
			return `a[${canonicalNode(node.items)}]`;
		case 'union': {
			const members = node.members
				.map((m) => ({ rank: KIND_RANK[m.kind], text: canonicalNode(m) }))
				.sort((x, y) => x.rank - y.rank || byCodeUnit(x.text, y.text))
				.map((m) => m.text);
			return `u[${members.join(',')}]`;
		}
		case 'object': {
			const props = [...node.props]
				.sort((x, y) => byCodeUnit(x.name, y.name))
				.map(
					(p) =>
						`${JSON.stringify(p.name)}:${p.required ? 'R' : '-'}${p.hasDefault ? 'D' : '-'}:${canonicalNode(p.node)}`,
				);
			return `o[${props.join(',')}|${node.valueType ? canonicalNode(node.valueType) : ''}|${node.open ? '+' : '-'}]`;
		}
	}
}

/** Everything the emitter reads besides the IR. Type names and variants change emitted bytes. */
export function canonicalOptions(opts: EmitOptions): string {
	const types = [...opts.types]
		.sort((x, y) => byCodeUnit(x.name, y.name))
		.map((t) => `${JSON.stringify(t.name)}:${t.variant}`);
	return `t[${types.join(',')}]`;
}

export function canonical(ir: IRRoot, opts: EmitOptions): string {
	// `unknownRoot` only reaches the output when the root really is unknown. Including it
	// otherwise would report drift for a regeneration that is a no-op.
	const rootOption = ir.root.kind === 'unknown' ? `r:${opts.unknownRoot ?? 'unknown'}` : '';
	return `${canonicalNode(ir.root)}|${canonicalOptions(opts)}${rootOption}`;
}
