import { normalizeNullable } from './nullable.js';

/**
 * Extracts `fields` and applies the `nullable` rewrite. Dataset schemas are nominally plain
 * JSON Schema, but real ones use `nullable` as freely as input schemas do.
 *
 * `actorSpecification`, `views` and `$schema` are dropped: display order, column labels and
 * table components carry nothing type-relevant.
 */
export function normalizeDatasetSchema(raw: unknown): unknown {
	// Anything that is not an object goes through untouched, so the core's diagnostic names
	// what was actually there instead of the `undefined` we would otherwise manufacture.
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
	return normalizeNullable((raw as Record<string, unknown>).fields);
}
