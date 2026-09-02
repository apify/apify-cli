import { Report, pointer, type Diagnostic, type Notice } from './diagnostics.js';
import { IR_VERSION, UNKNOWN, union, type IRNode, type IRProp, type IRRoot } from './ir.js';

export interface Lifted {
	ir: IRRoot;
	diagnostics: Diagnostic[];
	notices: Notice[];
}

const JSON_SCHEMA_TYPES = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'] as const;
type JsonSchemaType = (typeof JSON_SCHEMA_TYPES)[number];

/**
 * Keywords that carry type meaning we cannot represent. Anything *not* listed here and not
 * read below is ignored in silence — the core tolerates extraneous fields, so `editor`,
 * `prefill`, `title`, `pattern`, `minimum` and the rest produce nothing at all.
 *
 * `$defs` is deliberately absent: without a `$ref` pointing at it, it is dead weight.
 */
const UNSUPPORTED_KEYWORDS = [
	'oneOf',
	'anyOf',
	'allOf',
	'not',
	'if',
	'then',
	'else',
	'$ref',
	'patternProperties',
] as const;

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function jsonSchemaToIR(schema: unknown): Lifted {
	const report = new Report();
	const root = toNode(schema, '', report);
	return { ir: { irVersion: IR_VERSION, root }, diagnostics: report.diagnostics, notices: report.notices };
}

function toNode(schema: unknown, path: string, report: Report): IRNode {
	if (!isObj(schema)) {
		report.error(path, 'malformed-schema', `expected a JSON object, got ${describe(schema)}`);
		return UNKNOWN;
	}

	const unsupported = UNSUPPORTED_KEYWORDS.filter((k) => k in schema);
	if (unsupported.length > 0) {
		report.warn(path, 'unsupported-keyword', `${unsupported.join(', ')} is not supported yet`);
		return UNKNOWN;
	}

	// `enum` fully determines the type, so it wins over `type` when both are present.
	if ('enum' in schema) return fromEnum(schema.enum, path, report);

	const types = readTypes(schema, path, report);
	if (types === null) return UNKNOWN;

	return union(types.map((t) => fromType(t, schema, path, report)));
}

/** Returns null when `type` is unusable; infers from siblings when `type` is absent. */
function readTypes(schema: Obj, path: string, report: Report): JsonSchemaType[] | null {
	if (!('type' in schema)) {
		if ('properties' in schema || 'additionalProperties' in schema) return ['object'];
		if ('items' in schema) return ['array'];
		report.notice(path, 'empty-schema', 'no type information, treated as unknown');
		return null;
	}

	const raw = schema.type;
	const names = typeof raw === 'string' ? [raw] : raw;

	if (!Array.isArray(names) || !names.every((n) => typeof n === 'string')) {
		report.error(path, 'malformed-type', `\`type\` must be a string or an array of strings, got ${describe(raw)}`);
		return null;
	}
	if (names.length === 0) {
		report.error(path, 'empty-type-array', '`type: []` matches nothing');
		return null;
	}

	const unknownName = names.find((n) => !(JSON_SCHEMA_TYPES as readonly string[]).includes(n));
	if (unknownName !== undefined) {
		report.error(path, 'unknown-type-name', `\`${unknownName}\` is not a JSON Schema type`);
		return null;
	}

	return [...new Set(names as JsonSchemaType[])];
}

function fromType(type: JsonSchemaType, schema: Obj, path: string, report: Report): IRNode {
	switch (type) {
		case 'string':
			return { kind: 'string' };
		case 'number':
		case 'integer':
			return { kind: 'number' };
		case 'boolean':
			return { kind: 'boolean' };
		case 'null':
			return { kind: 'null' };
		case 'array':
			return fromArray(schema, path, report);
		case 'object':
			return fromObject(schema, path, report);
	}
}

function fromArray(schema: Obj, path: string, report: Report): IRNode {
	if (!('items' in schema)) return { kind: 'array', items: UNKNOWN };

	const { items } = schema;
	if (Array.isArray(items)) {
		// A tuple is still an array, so `Array<unknown>` is a sound degradation.
		report.warn(pointer(path, 'items'), 'unsupported-tuple-items', 'positional `items` is not supported yet');
		return { kind: 'array', items: UNKNOWN };
	}
	if (!isObj(items)) {
		report.error(pointer(path, 'items'), 'malformed-items', `expected an object or array, got ${describe(items)}`);
		return UNKNOWN;
	}

	return { kind: 'array', items: toNode(items, pointer(path, 'items'), report) };
}

function fromObject(schema: Obj, path: string, report: Report): IRNode {
	const required = readRequired(schema, path, report);
	if (required === null) return UNKNOWN;

	const props = readProps(schema, path, required, report);
	if (props === null) return UNKNOWN;

	const additional = readAdditional(schema, path, report);
	if (additional === null) return UNKNOWN;

	for (const name of required) {
		if (!props.some((p) => p.name === name)) {
			report.notice(
				pointer(path, 'required'),
				'required-unknown-property',
				`\`${name}\` is required but not declared in \`properties\``,
			);
		}
	}

	return additional.valueType
		? { kind: 'object', props, valueType: additional.valueType, open: additional.open }
		: { kind: 'object', props, open: additional.open };
}

function readRequired(schema: Obj, path: string, report: Report): string[] | null {
	if (!('required' in schema)) return [];
	const raw = schema.required;
	if (!Array.isArray(raw) || !raw.every((n) => typeof n === 'string')) {
		report.error(pointer(path, 'required'), 'malformed-required', `expected an array of strings, got ${describe(raw)}`);
		return null;
	}
	return raw as string[];
}

function readProps(schema: Obj, path: string, required: string[], report: Report): IRProp[] | null {
	if (!('properties' in schema)) return [];
	const raw = schema.properties;
	if (!isObj(raw)) {
		report.error(pointer(path, 'properties'), 'malformed-properties', `expected an object, got ${describe(raw)}`);
		return null;
	}

	// Object.keys preserves authored order, which the emitter reproduces.
	return Object.keys(raw).map((name) => ({
		name,
		node: toNode(raw[name], pointer(path, 'properties', name), report),
		required: required.includes(name),
		hasDefault: isObj(raw[name]) && 'default' in (raw[name] as Obj),
	}));
}

/** `{}` / `true` / absent are all "open"; only a non-empty subschema types the extra keys. */
function readAdditional(schema: Obj, path: string, report: Report): { open: boolean; valueType?: IRNode } | null {
	if (!('additionalProperties' in schema)) return { open: true };

	const raw = schema.additionalProperties;
	if (typeof raw === 'boolean') return { open: raw };
	if (!isObj(raw)) {
		report.error(
			pointer(path, 'additionalProperties'),
			'malformed-additional-properties',
			`expected a boolean or an object, got ${describe(raw)}`,
		);
		return null;
	}
	if (Object.keys(raw).length === 0) return { open: true };

	return { open: true, valueType: toNode(raw, pointer(path, 'additionalProperties'), report) };
}

function fromEnum(raw: unknown, path: string, report: Report): IRNode {
	if (!Array.isArray(raw) || raw.length === 0) {
		report.error(pointer(path, 'enum'), 'malformed-enum', `expected a non-empty array, got ${describe(raw)}`);
		return UNKNOWN;
	}

	const members: IRNode[] = [];
	for (const value of raw) {
		if (value === null) {
			members.push({ kind: 'null' });
			continue;
		}
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			members.push({ kind: 'literal', value });
			continue;
		}
		report.warn(
			pointer(path, 'enum'),
			'unsupported-enum-values',
			`\`enum\` holding ${describe(value)} cannot be expressed as a literal`,
		);
		return UNKNOWN;
	}

	return union(members);
}

function describe(value: unknown): string {
	if (value === null) return 'null';
	if (value === undefined) return 'undefined';
	if (Array.isArray(value)) return 'an array';
	return typeof value === 'object' ? 'an object' : `${typeof value} (${JSON.stringify(value)})`;
}
