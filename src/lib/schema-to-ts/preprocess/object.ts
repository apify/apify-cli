/** Apify's object-shaped schemas may omit the root `type`. Keep empty schemas unconstrained. */
export function defaultObjectType(schema: unknown): unknown {
	if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return schema;
	if ('type' in schema || Object.keys(schema).length === 0) return schema;
	return { ...schema, type: 'object' };
}
