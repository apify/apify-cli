/**
 * The IR is exactly the emitter's input: if something changes the emitted text it belongs
 * here, and if it cannot, it does not. That is what makes hash(IR) a sound drift signal.
 *
 * Deliberately Apify-blind and structural — `editor`, `prefill`, `title`, `pattern` and
 * friends never reach this file.
 */

export type IRNode =
	| { kind: 'string' } // just `string`, enums are a union of literals
	| { kind: 'number' } // `integer` collapses to `number`
	| { kind: 'boolean' }
	| { kind: 'null' }
	| { kind: 'unknown' }
	| { kind: 'literal'; value: string | number | boolean }
	| { kind: 'union'; members: IRNode[] }
	// no order or tupleness, all arrays are Array<T> with T being whatever we can represent with other IR
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
