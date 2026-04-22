import process from 'node:process';

import chalk from 'chalk';

import { ApifyCommand, StdinMode } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { Flags } from '../lib/command-framework/flags.js';
import { APIFY_CLIENT_DEFAULT_HEADERS, CommandExitCodes } from '../lib/consts.js';
import { error, simpleLog } from '../lib/outputs.js';
import { getLoggedClientOrThrow } from '../lib/utils.js';

const HTTP_METHODS: string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD']);
const OPENAPI_SPEC_URL = 'https://docs.apify.com/api/openapi.json';

interface OpenAPISpec {
	paths: Record<string, Record<string, { summary?: string }>>;
}

interface Endpoint {
	method: string;
	path: string;
	summary: string;
}

function parseParams(raw: string | undefined): string {
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

function parseHeaders(raw: string | undefined): Record<string, string> {
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

export class ApiCommand extends ApifyCommand<typeof ApiCommand> {
	static override name = 'api' as const;

	static override description =
		'Makes an authenticated HTTP request to the Apify API and prints the response.\n' +
		'The endpoint can be a relative path (e.g. "acts", "v2/acts", or "/v2/acts").\n' +
		'The "v2/" prefix is added automatically if omitted.\n\n' +
		'You can also pass the HTTP method before the endpoint:\n' +
		'  apify api GET /v2/actor-runs\n' +
		'  apify api POST /v2/acts -d \'{"name": "my-actor"}\'\n\n' +
		'Use --params/-p to pass query parameters as JSON:\n' +
		'  apify api actor-runs -p \'{"limit": 1, "desc": true}\'\n\n' +
		'Use --list-endpoints to see all available API endpoints.\n' +
		'For full documentation, see https://docs.apify.com/api/v2';

	static override args = {
		methodOrEndpoint: Args.string({
			required: false,
			description:
				'The API endpoint path (e.g. "acts", "v2/acts", "/v2/users/me"), ' +
				'or an HTTP method followed by the endpoint (e.g. "GET /v2/users/me").',
		}),
		endpoint: Args.string({
			required: false,
			description: 'The API endpoint path when the first argument is an HTTP method.',
		}),
	};

	static override flags = {
		method: Flags.string({
			char: 'X',
			description: 'The HTTP method to use. Defaults to GET.',
			choices: HTTP_METHODS,
		}),
		body: Flags.string({
			char: 'd',
			description: 'The request body (JSON string). Use "-" to read from stdin.',
			required: false,
			stdin: StdinMode.Stringified,
		}),
		header: Flags.string({
			char: 'H',
			description:
				'Additional HTTP header(s). Pass a single "key:value" string, or a JSON object ' +
				'like \'{"X-Foo": "bar", "X-Baz": "qux"}\' to send multiple headers. ' +
				'The flag can only be used once; use the JSON form for multiple headers.',
			required: false,
		}),
		params: Flags.string({
			char: 'p',
			description: 'Query parameters as a JSON object, e.g. \'{"limit": 1, "desc": true}\'.',
			required: false,
		}),
		'list-endpoints': Flags.boolean({
			char: 'l',
			description: 'List all available Apify API endpoints.',
			default: false,
		}),
	};

	async run() {
		if (this.flags.listEndpoints) {
			await this.printEndpoints();
			return;
		}

		// Support "apify api GET /v2/users/me" syntax — if the first arg is an HTTP method,
		// use it as the method and the second arg as the endpoint
		const explicitMethodFlag = this.flags.method?.toUpperCase();
		let method: string | undefined;
		let endpointArg = this.args.methodOrEndpoint;

		if (endpointArg && HTTP_METHODS.includes(endpointArg.toUpperCase())) {
			const positionalMethod = endpointArg.toUpperCase();

			if (explicitMethodFlag && explicitMethodFlag !== positionalMethod) {
				throw new Error(
					`Conflicting HTTP methods: positional "${positionalMethod}" vs --method "${explicitMethodFlag}". ` +
						'Please specify the method only once.',
				);
			}

			method = positionalMethod;
			endpointArg = this.args.endpoint;
		} else {
			method = explicitMethodFlag;
		}

		method ??= 'GET';

		if (!endpointArg) {
			this.printHelp();
			return;
		}

		// Parse and validate --params before any I/O so bad input fails fast
		const queryString = parseParams(this.flags.params);

		// Parse and validate --header(s) before any I/O
		const customHeaders = parseHeaders(this.flags.header);

		// Validate body is valid JSON before sending
		if (this.flags.body) {
			if (METHODS_WITHOUT_BODY.has(method)) {
				throw new Error(
					`HTTP ${method} requests cannot have a request body. Use a different method (e.g. POST, PUT, PATCH) or omit --body.`,
				);
			}

			try {
				JSON.parse(this.flags.body);
			} catch {
				throw new Error('Invalid JSON in --body flag. Please provide a valid JSON string.');
			}
		}

		const apifyClient = await getLoggedClientOrThrow();
		const token = apifyClient.token!;

		// Normalize endpoint — strip leading slash and any "v2/" prefix,
		// because apifyClient.baseUrl already ends in "/v2".
		let endpoint = endpointArg;

		if (endpoint.startsWith('/')) {
			endpoint = endpoint.slice(1);
		}

		endpoint = endpoint.replace(/^v2\//i, '');

		let url = `${apifyClient.baseUrl}/${endpoint}`;

		if (queryString) {
			const separator = url.includes('?') ? '&' : '?';
			url = `${url}${separator}${queryString}`;
		}

		// Build headers. Custom headers overwrite defaults case-insensitively so
		// callers can override e.g. Content-Type without creating duplicate entries.
		const headers: Record<string, string> = {
			...APIFY_CLIENT_DEFAULT_HEADERS,
			Authorization: `Bearer ${token}`,
		};

		if (this.flags.body) {
			headers['Content-Type'] = 'application/json';
		}

		for (const [key, value] of Object.entries(customHeaders)) {
			for (const existingKey of Object.keys(headers)) {
				if (existingKey.toLowerCase() === key.toLowerCase()) {
					delete headers[existingKey];
				}
			}
			headers[key] = value;
		}

		// Make the request
		const response = await fetch(url, {
			method,
			headers,
			body: this.flags.body || undefined,
		});

		const responseText = await response.text();

		if (!response.ok) {
			process.exitCode = CommandExitCodes.RunFailed;

			// Print status to stderr but JSON response bodies to stdout so that
			// pipelines like `apify api ... | jq` still receive the payload on failure.
			error({ message: `${response.status} ${response.statusText}` });

			if (responseText) {
				try {
					const parsed = JSON.parse(responseText);
					simpleLog({ message: JSON.stringify(parsed, null, 2), stdout: true });
				} catch {
					simpleLog({ message: responseText, stdout: true });
				}
			}

			if (response.status === 404) {
				simpleLog({
					message: `\nRun ${chalk.cyan('apify api --list-endpoints')} to see all available Apify API endpoints.`,
					stdout: false,
				});
			}

			return;
		}

		if (responseText) {
			try {
				const parsed = JSON.parse(responseText);
				simpleLog({ message: JSON.stringify(parsed, null, 2), stdout: true });
			} catch {
				simpleLog({ message: responseText, stdout: true });
			}
		}
	}

	private async printEndpoints() {
		const endpoints = await fetchEndpoints();

		const methodColors: Record<string, (text: string) => string> = {
			GET: chalk.green,
			POST: chalk.yellow,
			PUT: chalk.blue,
			PATCH: chalk.cyan,
			DELETE: chalk.red,
		};

		for (const { method, path, summary } of endpoints) {
			const colorize = methodColors[method] || chalk.white;
			const methodStr = colorize(method.padEnd(7));
			const summaryStr = summary ? chalk.gray(` ${summary}`) : '';

			console.log(`${methodStr} ${path}${summaryStr}`);
		}
	}
}

async function fetchEndpoints(): Promise<Endpoint[]> {
	let response: Response;

	try {
		response = await fetch(OPENAPI_SPEC_URL);
	} catch (err) {
		throw new Error(
			`Failed to download the Apify OpenAPI spec from ${OPENAPI_SPEC_URL}: ${(err as Error).message}`,
		);
	}

	if (!response.ok) {
		throw new Error(
			`Failed to download the Apify OpenAPI spec from ${OPENAPI_SPEC_URL}: ${response.status} ${response.statusText}`,
		);
	}

	const spec = (await response.json()) as OpenAPISpec;
	const endpoints: Endpoint[] = [];

	for (const [path, methods] of Object.entries(spec.paths)) {
		for (const [method, details] of Object.entries(methods)) {
			if (HTTP_METHODS.includes(method.toUpperCase())) {
				endpoints.push({
					method: method.toUpperCase(),
					path,
					summary: details.summary || '',
				});
			}
		}
	}

	endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

	return endpoints;
}
