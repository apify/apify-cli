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

		const clone = structuredClone(jsonSchema);

		if (!clone.type) {
			clone.type = 'object';
		}

		result.push({ name, schema: clone });
	}

	return result;
}
