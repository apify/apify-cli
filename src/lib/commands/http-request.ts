export const HTTP_METHODS: string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
export const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD']);

export function parseParams(raw: string | undefined): string {
	if (!raw) {
		return '';
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error('Invalid JSON in --params flag. Please provide a valid JSON object, e.g. \'{"limit": 1}\'.');
	}

	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('--params must be a JSON object (e.g. \'{"limit": 1}\').');
	}

	const searchParams = new URLSearchParams();

	for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
		if (value === undefined || value === null) {
			continue;
		}

		if (typeof value === 'object') {
			throw new Error(
				`--params value for "${key}" must be a scalar (string, number, or boolean), got ${Array.isArray(value) ? 'array' : 'object'}. ` +
					'Query parameters cannot contain nested objects or arrays.',
			);
		}

		searchParams.append(key, String(value));
	}

	return searchParams.toString();
}

export function parseHeaders(raw: string | undefined): Record<string, string> {
	if (!raw) {
		return {};
	}

	const trimmed = raw.trim();

	// JSON object form: --header '{"X-Foo": "bar", "X-Baz": "qux"}'
	if (trimmed.startsWith('{')) {
		let parsed: unknown;

		try {
			parsed = JSON.parse(trimmed);
		} catch {
			throw new Error('Invalid JSON in --header flag. Provide a JSON object like \'{"X-Foo": "bar"}\'.');
		}

		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error('--header JSON must be an object mapping header names to string values.');
		}

		const result: Record<string, string> = {};

		for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (typeof value !== 'string') {
				throw new Error(`--header value for "${key}" must be a string, got ${typeof value}.`);
			}

			result[key.trim()] = value.trim();
		}

		return result;
	}

	// "key:value" form
	const colonIndex = trimmed.indexOf(':');

	if (colonIndex === -1) {
		throw new Error('Header must be in "key:value" format, or a JSON object for multiple headers.');
	}

	return {
		[trimmed.slice(0, colonIndex).trim()]: trimmed.slice(colonIndex + 1).trim(),
	};
}

/**
 * Custom headers overwrite defaults case-insensitively so callers can override e.g. Content-Type
 * without creating duplicate entries.
 */
export function mergeHeaders(defaults: Record<string, string>, custom: Record<string, string>): Record<string, string> {
	const headers = { ...defaults };

	for (const [key, value] of Object.entries(custom)) {
		for (const existingKey of Object.keys(headers)) {
			if (existingKey.toLowerCase() === key.toLowerCase()) {
				delete headers[existingKey];
			}
		}
		headers[key] = value;
	}

	return headers;
}
