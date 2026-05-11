import { defineMessages } from '../../lib/i18n/index.js';

export const ApiCommandMessages = defineMessages({
	en: {
		paramsInvalidJson: {
			markdown: `Invalid JSON in --params flag. Please provide a valid JSON object, e.g. ''{example}''.`,
			json: () => null,
		},
		paramsNotObject: {
			markdown: `--params must be a JSON object (e.g. ''{example}'').`,
			json: () => null,
		},
		paramsNotScalar: {
			markdown:
				'--params value for "{key}" must be a scalar (string, number, or boolean), got {kind}. Query parameters cannot contain nested objects or arrays.',
			json: () => null,
		},
		headerInvalidJson: {
			markdown: `Invalid JSON in --header flag. Provide a JSON object like ''{example}''.`,
			json: () => null,
		},
		headerJsonNotObject: {
			markdown: '--header JSON must be an object mapping header names to string values.',
			json: () => null,
		},
		headerValueNotString: {
			markdown: '--header value for "{key}" must be a string, got {kind}.',
			json: () => null,
		},
		headerInvalidFormat: {
			markdown: 'Header must be in "key:value" format, or a JSON object for multiple headers.',
			json: () => null,
		},
		conflictingMethods: {
			markdown:
				'Conflicting HTTP methods: positional "{positionalMethod}" vs --method "{explicitMethodFlag}". Please specify the method only once.',
			json: () => null,
		},
		methodCannotHaveBody: {
			markdown:
				'HTTP {method} requests cannot have a request body. Use a different method (e.g. POST, PUT, PATCH) or omit --body.',
			json: () => null,
		},
		bodyInvalidJson: {
			markdown: 'Invalid JSON in --body flag. Please provide a valid JSON string.',
			json: () => null,
		},
		responseStatus: {
			markdown: '{status,number} {statusText}',
			json: () => null,
		},
		listEndpointsHint: {
			markdown: (md, colors) =>
				md(`\nRun ${colors.cyan('apify api --list-endpoints')} to see all available Apify API endpoints.`),
			json: () => null,
		},
		specDownloadFailedFetch: {
			markdown: 'Failed to download the Apify OpenAPI spec from {url}: {message}',
			json: () => null,
		},
		specDownloadFailedStatus: {
			markdown: 'Failed to download the Apify OpenAPI spec from {url}: {status,number} {statusText}',
			json: () => null,
		},
	},
});
