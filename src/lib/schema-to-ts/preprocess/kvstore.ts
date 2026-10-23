import { normalizeNullable } from './nullable.js';

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Rewrites `collections` into one object schema whose properties are the collection names and
 * whose values are the collections' `jsonSchema`s.
 *
 * The result is a lookup table, not a document: no request ever carries this object, it exists
 * so `KeyValueStore['results']` names the type of a record in that collection. That is why
 * every key is `required` and the object is closed — a collection the schema declares always
 * exists, and one it does not is a typo rather than an extra.
 *
 * A collection with no `jsonSchema` (images, binaries) becomes `{}`, which the core reports as
 * a notice and types `unknown`: there is no JSON shape to describe, and that is not an error.
 *
 * `title`, `key`, `keyPrefix` and `contentTypes` are dropped along with the collection wrapper
 * — storage layout and content negotiation carry nothing type-relevant.
 */
export function normalizeKvstoreSchema(raw: unknown): unknown {
	// Anything that is not an object goes through untouched, so the core's diagnostic names
	// what was actually there instead of the `undefined` we would otherwise manufacture.
	if (!isObj(raw)) return raw;

	const { collections } = raw;
	// Same reasoning one level down: a missing or malformed `collections` is the core's to report.
	if (!isObj(collections)) return collections;

	const properties: Obj = {};
	for (const [name, collection] of Object.entries(collections)) {
		// `in` rather than a truthiness check: a `jsonSchema` that is present but malformed is
		// passed on so the core names it, instead of being silently softened to `unknown`.
		properties[name] = isObj(collection) && 'jsonSchema' in collection ? normalizeNullable(collection.jsonSchema) : {};
	}

	return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}
