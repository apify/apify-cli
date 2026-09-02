import { irHash } from './hash.js';
import { IR_VERSION, type IRNode, type IRRoot } from './ir.js';

/**
 * IR → TypeScript. Apify-blind, no IO: takes an IR, returns the complete file text.
 *
 * `type` always, never `interface` — one code path for object, union, Record and unknown
 * roots, and no declaration merging that would let a user silently augment generated types.
 */

/**
 * Stated relative to the data, not to "the code":
 *  - `supplied` is the writer's obligation, so be permissive (only `required` is mandatory,
 *    open objects accept extras).
 *  - `received` is the reader's view, so be precise (defaults are materialized by the
 *    platform, objects are closed so property typos are caught).
 */
export type Variant = 'supplied' | 'received';

export interface EmitOptions {
	types: { name: string; variant: Variant }[];
	/** For a root we could not read, `unknown` is the truth; `record` is a softer guess. */
	unknownRoot?: 'unknown' | 'record';
}

const INDENT = '    ';

/** Exactly TypeScript's ASCII identifier rule. Reserved words are legal property names. */
const BARE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export const HEADER_PREFIX = '// @generated schema-ts';
export const HEADER_SUFFIX = 'do not edit';

/** Version covers both IR semantics and emitted output — bump it when either changes. */
export function header(hash: string): string {
	return `${HEADER_PREFIX} v${IR_VERSION}-${hash} — ${HEADER_SUFFIX}`;
}

export function emit(ir: IRRoot, opts: EmitOptions): string {
	// Authored order for emission; the canonical form sorts for the hash.
	const declarations = opts.types.map(({ name, variant }) => {
		const body = ir.root.kind === 'unknown' ? unknownRoot(opts) : renderNode(ir.root, variant, '');
		return `export type ${name} = ${body};`;
	});

	return [header(irHash(ir, opts)), '', ...declarations.flatMap((d) => [d, ''])].join('\n');
}

function unknownRoot(opts: EmitOptions): string {
	return opts.unknownRoot === 'record' ? 'Record<string, unknown>' : 'unknown';
}

function renderNode(node: IRNode, variant: Variant, indent: string): string {
	switch (node.kind) {
		case 'string':
			return 'string';
		case 'number':
			return 'number';
		case 'boolean':
			return 'boolean';
		case 'null':
			return 'null';
		case 'unknown':
			return 'unknown';
		case 'literal':
			return JSON.stringify(node.value);
		case 'union':
			return node.members.map((m) => renderNode(m, variant, indent)).join(' | ');
		// `Array<T>` always, so no element ever needs parenthesizing.
		case 'array':
			return `Array<${renderNode(node.items, variant, indent)}>`;
		case 'object':
			return renderObject(node, variant, indent);
	}
}

function renderObject(node: Extract<IRNode, { kind: 'object' }>, variant: Variant, indent: string): string {
	const values = node.valueType ? renderNode(node.valueType, variant, indent) : null;

	if (node.props.length === 0) {
		// Never a bare `{}`: in TS that means "anything non-nullish", so `x = 5` would pass.
		if (values !== null) return `Record<string, ${values}>`;
		return node.open ? 'Record<string, unknown>' : 'Record<string, never>';
	}

	const inner = indent + INDENT;
	const members = node.props.map((prop) => {
		const optional = variant === 'supplied' ? !prop.required : !prop.required && !prop.hasDefault;
		const type = renderNode(prop.node, variant, inner);
		// `?` and `| undefined` together, so the type is right under exactOptionalPropertyTypes.
		// `unknown` already admits undefined, so widening it would be noise.
		const suffix = optional && type !== 'unknown' ? ' | undefined' : '';
		return `${inner}${key(prop.name)}${optional ? '?' : ''}: ${type}${suffix};`;
	});
	const literal = `{\n${members.join('\n')}\n${indent}}`;

	// Parenthesized unconditionally: `&` binds tighter than `|` so it is already correct inside
	// a union, but `{...} & Record<...> | null` is a horrible thing to read. Keeping it
	// unconditional means the object never has to know what context it sits in.
	if (values !== null) return `(${literal} & Record<string, ${values}>)`;
	// Extras are the writer's privilege; the reader gets a closed type so typos are caught.
	if (variant === 'supplied' && node.open) return `(${literal} & Record<string, unknown>)`;
	return literal;
}

function key(name: string): string {
	return BARE_IDENTIFIER.test(name) ? name : JSON.stringify(name);
}
