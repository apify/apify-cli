/**
 * Rewrites the `nullable` shorthand into the JSON Schema it stands for:
 * `{ type: 'string', nullable: true }` becomes `{ type: ['string', 'null'] }`.
 *
 * Shared rather than input-specific: real dataset schemas use `nullable` too, even though
 * they are nominally plain JSON Schema.
 *
 * Pure — the caller's object is never mutated. Idempotent, since `nullable` is consumed and
 * `'null'` is never appended twice.
 */

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Only these keys hold subschemas. `default`, `example`, `prefill` and `enum` hold *data*,
 *  which must be copied verbatim — a `nullable` key inside an example is not a schema. */
const SUBSCHEMA_KEYS = new Set(['properties', 'items', 'additionalProperties']);

export function normalizeNullable(schema: unknown): unknown {
	// Positional `items: [...]`: every member is a subschema.
	if (Array.isArray(schema)) return schema.map(normalizeNullable);
	if (!isObj(schema)) return schema;

	const result: Obj = {};
	for (const [key, value] of Object.entries(schema)) {
		if (key === 'nullable') continue; // consumed below
		if (!SUBSCHEMA_KEYS.has(key)) {
			result[key] = value;
			continue;
		}
		result[key] =
			key === 'properties' && isObj(value)
				? Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, normalizeNullable(sub)]))
				: normalizeNullable(value);
	}

	if (schema.nullable === true) {
		const widened = withNull(schema);
		// Assigning `undefined` would make `'type' in schema` true and trip malformed-type.
		if (widened !== undefined) result.type = widened;
	}
	return result;
}

/**
 * Every branch is lossless. When `type` is absent the sibling keywords say what it would have
 * been, and a schema with no keywords at all (`{}`) already admits null, so dropping the flag
 * there changes nothing.
 */
function withNull(schema: Obj): unknown {
	const { type } = schema;
	if (typeof type === 'string') return type === 'null' ? type : [type, 'null'];
	if (Array.isArray(type)) return type.includes('null') ? type : [...type, 'null'];
	if (type !== undefined) return type; // malformed — leave it for the core to report
	if ('properties' in schema || 'additionalProperties' in schema) return ['object', 'null'];
	if ('items' in schema) return ['array', 'null'];
	return undefined;
}
