/**
 * A diagnostic means *fidelity was lost* — a node that could have been typed precisely was
 * degraded. Nothing else is a diagnostic. Schema lint with no type impact is a notice.
 *
 * Neither feeds the hash: every diagnostic already implies an IR difference (a node became
 * `unknown`), so hashing them would only discriminate cases where the emitted file is
 * byte-identical.
 */

/** Malformed input we cannot read. The CLI refuses to write when any of these are present. */
export type ErrorCode =
	| 'malformed-schema' // not a JSON object
	| 'malformed-type' // `type` is neither a string nor an array of strings
	| 'unknown-type-name' // `type` names something outside the 7 JSON Schema types
	| 'empty-type-array' // `type: []`
	| 'malformed-properties' // `properties` is not an object
	| 'malformed-required' // `required` is not an array of strings
	| 'malformed-items' // `items` is neither an object nor an array
	| 'malformed-enum' // `enum` is not a non-empty array
	| 'malformed-additional-properties'; // `additionalProperties` is neither boolean nor object

/** Well-formed JSON Schema we do not support yet. */
export type WarningCode =
	| 'unsupported-keyword' // oneOf / anyOf / allOf / not / if-then-else / $ref / patternProperties
	| 'unsupported-tuple-items' // positional `items: [...]`
	| 'unsupported-enum-values'; // `enum` holding objects or arrays

/** No type impact whatsoever. */
export type NoticeCode =
	| 'required-unknown-property' // `required` names a property that does not exist
	| 'empty-schema'; // `{}` — faithfully `unknown`, not a degradation

export interface Diagnostic {
	/** JSON Pointer into the schema */
	path: string;
	severity: 'error' | 'warning';
	code: ErrorCode | WarningCode;
	message: string;
}

export interface Notice {
	path: string;
	code: NoticeCode;
	message: string;
}

/** JSON Pointer escaping (RFC 6901). */
export function pointer(base: string, ...segments: string[]): string {
	return base + segments.map((s) => `/${s.replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
}

export class Report {
	readonly diagnostics: Diagnostic[] = [];
	readonly notices: Notice[] = [];

	error(path: string, code: ErrorCode, message: string): void {
		this.diagnostics.push({ path, severity: 'error', code, message });
	}

	warn(path: string, code: WarningCode, message: string): void {
		this.diagnostics.push({ path, severity: 'warning', code, message });
	}

	notice(path: string, code: NoticeCode, message: string): void {
		this.notices.push({ path, code, message });
	}
}
