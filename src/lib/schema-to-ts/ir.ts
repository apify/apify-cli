/**
 * The IR is exactly the emitter's input: if something changes the emitted text it belongs
 * here, and if it cannot, it does not. That is what makes hash(IR) a sound drift signal.
 *
 * Deliberately Apify-blind and structural — `editor`, `prefill`, `title`, `pattern` and
 * friends never reach this file.
 */

export type IRNode =
	| { kind: 'string' }
	| { kind: 'number' } // `integer` collapses to `number`
	| { kind: 'boolean' }
	| { kind: 'null' }
	| { kind: 'unknown' }
	| { kind: 'literal'; value: string | number | boolean }
	| { kind: 'union'; members: IRNode[] }
	| { kind: 'array'; items: IRNode }
	| { kind: 'object'; props: IRProp[]; valueType?: IRNode; open: boolean };

/** `props` is an array so authored order is structural, not a function of JS key order. */
export interface IRProp {
	name: string;
	node: IRNode;
	/** listed in `required` */
	required: boolean;
	/** has a `default`, which the platform materializes into the received record */
	hasDefault: boolean;
}

export const IR_VERSION = 1;

export interface IRRoot {
	irVersion: typeof IR_VERSION;
	root: IRNode;
}

export const UNKNOWN: IRNode = { kind: 'unknown' };

/**
 * Structural key used only for de-duplicating union members. The canonical serializer that
 * feeds the hash is a separate, sorted representation — do not conflate them.
 */
export function nodeKey(node: IRNode): string {
	switch (node.kind) {
		case 'literal':
			return `l:${typeof node.value}:${String(node.value)}`;
		case 'union':
			return `u[${node.members.map(nodeKey).join(',')}]`;
		case 'array':
			return `a[${nodeKey(node.items)}]`;
		case 'object':
			return `o[${node.props
				.map((p) => `${p.name}${p.required ? 'R' : '-'}${p.hasDefault ? 'D' : '-'}:${nodeKey(p.node)}`)
				.join(',')}|${node.valueType ? nodeKey(node.valueType) : ''}|${node.open ? '+' : '-'}]`;
		default:
			return node.kind;
	}
}

/** Flattens, de-dupes, and collapses so there is exactly one IR per type. */
export function union(members: IRNode[]): IRNode {
	const flat: IRNode[] = [];
	const seen = new Set<string>();
	const push = (node: IRNode): void => {
		if (node.kind === 'union') {
			node.members.forEach(push);
			return;
		}
		const key = nodeKey(node);
		if (seen.has(key)) return;
		seen.add(key);
		flat.push(node);
	};
	members.forEach(push);

	if (flat.length === 0) return UNKNOWN;
	if (flat.length === 1) return flat[0]!;
	// `unknown` absorbs everything it is unioned with.
	if (flat.some((n) => n.kind === 'unknown')) return UNKNOWN;
	return { kind: 'union', members: flat };
}
