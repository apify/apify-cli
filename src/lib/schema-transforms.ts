import deepClone from 'lodash.clonedeep';

/**
 * Transforms a JSON schema so that all properties without a `default` value are marked as required.
 * Properties that have a `default` are left optional, since Apify fills them in at runtime.
 * Recurses into nested object properties.
 */
export function makePropertiesRequired(schema: Record<string, unknown>): Record<string, unknown> {
	const clone = deepClone(schema);

	if (!clone.properties || typeof clone.properties !== 'object') {
		return clone;
	}

	const properties = clone.properties as Record<string, Record<string, unknown>>;
	const requiredSet = new Set<string>(Array.isArray(clone.required) ? (clone.required as string[]) : []);

	for (const [key, prop] of Object.entries(properties)) {
		if (prop.default === undefined) {
			requiredSet.add(key);
		} else {
			requiredSet.delete(key);
		}

		if (prop.type === 'object' && prop.properties) {
			properties[key] = makePropertiesRequired(prop) as Record<string, unknown>;
		}
	}

	clone.required = Array.from(requiredSet);

	return clone;
}

/**
 * Deep clones a schema and recursively removes all `required` arrays,
 * making every property optional at all nesting levels.
 */
export function clearAllRequired(schema: Record<string, unknown>): Record<string, unknown> {
	const clone = deepClone(schema);

	delete clone.required;

	if (clone.properties && typeof clone.properties === 'object') {
		const properties = clone.properties as Record<string, Record<string, unknown>>;
		for (const [key, prop] of Object.entries(properties)) {
			if (prop.type === 'object' && prop.properties) {
				properties[key] = clearAllRequired(prop) as Record<string, unknown>;
			}
		}
	}

	return clone;
}

/**
 * Recursively strips `title` from all properties in a schema.
 *
 * When a nested property has a `title`, `json-schema-to-typescript` extracts it
 * as a separate named `export interface`. Stripping titles forces all nested types
 * to be inlined, ensuring only one exported interface per schema.
 */
export function stripTitles(schema: Record<string, unknown>): Record<string, unknown> {
	const clone = deepClone(schema);

	delete clone.title;

	if (clone.properties && typeof clone.properties === 'object') {
		const properties = clone.properties as Record<string, Record<string, unknown>>;
		for (const [key, prop] of Object.entries(properties)) {
			if (prop && typeof prop === 'object') {
				properties[key] = stripTitles(prop) as Record<string, unknown>;
			}
		}
	}

	if (clone.items && typeof clone.items === 'object') {
		clone.items = stripTitles(clone.items as Record<string, unknown>);
	}

	// Recurse into composition keywords (arrays of sub-schemas)
	for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
		if (Array.isArray(clone[keyword])) {
			clone[keyword] = (clone[keyword] as Record<string, unknown>[]).map((subSchema) =>
				subSchema && typeof subSchema === 'object' ? stripTitles(subSchema) : subSchema,
			);
		}
	}

	// Recurse into definitions / $defs (objects mapping names to sub-schemas)
	for (const keyword of ['definitions', '$defs'] as const) {
		if (clone[keyword] && typeof clone[keyword] === 'object' && !Array.isArray(clone[keyword])) {
			const defs = clone[keyword] as Record<string, Record<string, unknown>>;
			for (const [key, def] of Object.entries(defs)) {
				if (def && typeof def === 'object') {
					defs[key] = stripTitles(def) as Record<string, unknown>;
				}
			}
		}
	}

	// Recurse into additionalProperties when it is a schema object
	if (clone.additionalProperties && typeof clone.additionalProperties === 'object') {
		clone.additionalProperties = stripTitles(clone.additionalProperties as Record<string, unknown>);
	}

	return clone;
}

/**
 * Extracts and prepares the `fields` sub-schema from a Dataset or KVS schema for compilation.
 * Returns `null` if the schema has no compilable fields (empty or missing).
 */
export function prepareFieldsSchemaForCompilation(schema: Record<string, unknown>): Record<string, unknown> | null {
	const fields = schema.fields as Record<string, unknown> | undefined;

	if (!fields || typeof fields !== 'object' || !fields.properties || typeof fields.properties !== 'object') {
		return null;
	}

	const clone = deepClone(fields);

	if (!clone.type) {
		clone.type = 'object';
	}

	return clone;
}

/**
 * Prepares an Output schema for compilation by stripping non-JSON-Schema keys.
 *
 * Output schemas have `properties` at the top level where each property always has
 * `type: "string"` and a `template` field (URL construction pattern).
 * We strip `template` since it's not valid JSON Schema.
 *
 * Returns `null` if the schema has no compilable properties.
 */
export function prepareOutputSchemaForCompilation(schema: Record<string, unknown>): Record<string, unknown> | null {
	const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;

	if (!properties || typeof properties !== 'object' || Object.keys(properties).length === 0) {
		return null;
	}

	const clonedProperties = deepClone(properties);

	// Strip non-JSON-Schema keys (like `template`) from each property
	for (const prop of Object.values(clonedProperties)) {
		if (prop && typeof prop === 'object') {
			delete prop.template;
		}
	}

	const result: Record<string, unknown> = {
		type: schema.type || 'object',
		properties: clonedProperties,
	};

	if (Array.isArray(schema.required)) {
		result.required = [...schema.required];
	}

	return result;
}

/**
 * Extracts compilable JSON schemas from KVS collections.
 *
 * KVS schemas use `collections` where each collection can have a `jsonSchema` (Draft 07).
 * Only collections with `jsonSchema` are returned, as non-JSON collections (e.g. images)
 * have no type to generate.
 *
 * Returns an array of `{ name, schema }` pairs, or an empty array if none are found.
 */
export function prepareKvsCollectionsForCompilation(
	schema: Record<string, unknown>,
): { name: string; schema: Record<string, unknown> }[] {
	const collections = schema.collections as Record<string, Record<string, unknown>> | undefined;

	if (!collections || typeof collections !== 'object') {
		return [];
	}

	const result: { name: string; schema: Record<string, unknown> }[] = [];

	for (const [name, collection] of Object.entries(collections)) {
		if (!collection || typeof collection !== 'object') {
			continue;
		}

		const jsonSchema = collection.jsonSchema as Record<string, unknown> | undefined;

		if (!jsonSchema || typeof jsonSchema !== 'object' || Object.keys(jsonSchema).length === 0) {
			continue;
		}

		const clone = deepClone(jsonSchema);

		if (!clone.type) {
			clone.type = 'object';
		}

		result.push({ name, schema: clone });
	}

	return result;
}
