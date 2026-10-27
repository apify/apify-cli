import { normalizeNullable } from './nullable.js';

/**
 * An input schema *is* the JSON Schema — there is no wrapper to unwrap — so the only rewrite
 * is the `nullable` shorthand.
 *
 * Everything else the format adds (`editor`, `prefill`, `example`, `enumTitles`, `unit`,
 * `isSecret`, `sectionCaption`, `schemaVersion`, …) is left in place: the core ignores keys it
 * does not recognise, so there is nothing to gain by stripping them.
 */
export function normalizeInputSchema(raw: unknown): unknown {
	return normalizeNullable(raw);
}
