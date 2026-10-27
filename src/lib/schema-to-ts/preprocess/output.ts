import { defaultObjectType } from './object.js';

/** Output schemas are object-shaped and may omit the root `type`. */
export function normalizeOutputSchema(raw: unknown): unknown {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || !('properties' in raw)) return raw;
	return defaultObjectType(raw);
}
