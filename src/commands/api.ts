import process from 'node:process';

import chalk from 'chalk';

import { ApifyCommand, StdinMode } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { Flags } from '../lib/command-framework/flags.js';
import { APIFY_CLIENT_DEFAULT_HEADERS, CommandExitCodes } from '../lib/consts.js';
import { error, simpleLog, warning } from '../lib/outputs.js';
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

const METHOD_COLORS: Record<string, (text: string) => string> = {
	GET: chalk.green,
	POST: chalk.yellow,
	PUT: chalk.blue,
	PATCH: chalk.cyan,
	DELETE: chalk.red,
};

function formatEndpointLine(ep: Endpoint): string {
	const colorize = METHOD_COLORS[ep.method] || chalk.white;
	const methodStr = colorize(ep.method.padEnd(7));
	const summaryStr = ep.summary ? chalk.gray(` ${ep.summary}`) : '';
	return `${methodStr} ${ep.path}${summaryStr}`;
}

const LIST_ENDPOINTS_HINT = `Run ${chalk.cyan('apify api --list-endpoints')} to see all available Apify API endpoints.`;

function printSuggestions(suggestions: Endpoint[]) {
	if (suggestions.length > 0) {
		simpleLog({ message: `\nDid you mean:`, stdout: false });

		for (const ep of suggestions) {
			simpleLog({ message: `  ${formatEndpointLine(ep)}`, stdout: false });
		}
	}

	simpleLog({ message: `\n${LIST_ENDPOINTS_HINT}`, stdout: false });
}

export class ApiCommand extends ApifyCommand<typeof ApiCommand> {
	private cachedEndpoints: Endpoint[] | null = null;

	static override name = 'api' as const;

	static override description =
		'Makes an authenticated HTTP request to the Apify API and prints the response.\n' +
		'The endpoint can be a relative path (e.g. "acts", "v2/acts", or "/v2/acts"); ' +
		'the "v2/" prefix is added automatically if omitted.\n\n' +
		'Prefer --params to pass query parameters. If you must include a "?" inline, ' +
		'quote the whole endpoint so the shell does not treat "&" as a background operator.\n\n' +
		'Use --list-endpoints to see all available API endpoints.';

	static override examples = [
		{
			description: 'Make a GET request to an API endpoint (defaults to GET).',
			command: 'apify api users/me',
		},
		{
			description: 'Pass the HTTP method as a positional argument before the endpoint.',
			command: 'apify api GET /v2/actor-runs',
		},
		{
			description: 'Create a resource by POSTing a JSON body.',
			command: `apify api POST acts -d '{"name":"my-actor"}'`,
		},
		{
			description: 'Pass query parameters as a JSON object.',
			command: `apify api actor-runs -p '{"limit":1,"desc":true}'`,
		},
		{
			description: 'Send one or more custom headers as a JSON object.',
			command: `apify api acts -H '{"X-Foo":"bar","X-Baz":"qux"}'`,
		},
		{
			description: 'List all available Apify API endpoints.',
			command: 'apify api --list-endpoints',
		},
		{
			description: 'Search for endpoints matching a query.',
			command: 'apify api --list-endpoints --search "actor run"',
		},
		{
			description: 'Print a reference for an endpoint (methods, summary, path params).',
			command: 'apify api --describe actor-runs/{runId}',
		},
	];

	static override docsUrl = 'https://docs.apify.com/api/v2';

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
			exclusive: ['describe'],
		}),
		search: Flags.string({
			char: 's',
			description:
				'Filter results returned by --list-endpoints. The query is case-insensitive and split into tokens by spaces. ' +
				"For an endpoint to be returned, every token must appear in that endpoint's method, path, or summary.",
			required: false,
			exclusive: ['describe'],
		}),
		describe: Flags.string({
			description:
				'Print a reference for an endpoint path: its HTTP methods, summary, and path parameters. ' +
				'Leading slashes and a version prefix in the path are optional. ' +
				'For example, "actor-runs/{runId}" and "/v2/actor-runs/{runId}" are both accepted.',
			required: false,
			exclusive: ['list-endpoints', 'search'],
		}),
	};

	async run() {
		if (this.flags.search && !this.flags.listEndpoints) {
			throw new Error('The --search flag can only be used together with --list-endpoints.');
		}

		if (this.flags.describe) {
			await this.describeEndpoint(this.flags.describe);
			return;
		}

		if (this.flags.listEndpoints) {
			await this.printEndpoints(this.flags.search);
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

		// The endpoint arrives as a single argv entry. If the user typed something like
		//   apify api /v2/acts?my=1&limit=100
		// without quotes, the shell interpreted "&" as a background operator and the CLI
		// only ever received "/v2/acts?my=1" — the rest was silently lost. We cannot see
		// the missing "&" (the shell consumed it), but the leftover "?" in the endpoint
		// is a strong signal that inline query params were being passed. Warn the user
		// so the truncation is never silent, and point them at safer forms.
		if (endpointArg.includes('?')) {
			warning({
				message:
					'The endpoint contains a "?". If the command line was not fully quoted, ' +
					'the shell may have silently dropped everything after an unquoted "&" or ' +
					'expanded "?" as a glob. Prefer --params to pass query parameters, e.g.\n' +
					`  ${chalk.cyan(`apify api /v2/acts -p '{"my":1,"limit":100}'`)}\n` +
					'or quote the whole endpoint:\n' +
					`  ${chalk.cyan(`apify api '/v2/acts?my=1&limit=100'`)}`,
				stdout: false,
			});
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

		// apifyClient.baseUrl already ends in "/v2"
		const endpoint = normalizePath(endpointArg);

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
				await this.print404Suggestions(endpoint);
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

	private async getEndpoints(): Promise<Endpoint[]> {
		this.cachedEndpoints ??= await fetchEndpoints();
		return this.cachedEndpoints;
	}

	private async printEndpoints(search?: string) {
		let endpoints = await this.getEndpoints();

		if (search) {
			endpoints = filterEndpoints(endpoints, search);

			if (endpoints.length === 0) {
				simpleLog({ message: `No endpoints matched the query "${search}".`, stdout: false });
				return;
			}
		}

		for (const ep of endpoints) {
			console.log(formatEndpointLine(ep));
		}
	}

	private async describeEndpoint(input: string) {
		const normalized = normalizePath(input);
		const endpoints = await this.getEndpoints();

		const matches = endpoints.filter((ep) => normalizePath(ep.path) === normalized);

		if (matches.length > 0) {
			const pathParams = extractPathParams(matches[0].path);

			console.log(chalk.bold(matches[0].path));
			console.log('');

			for (const ep of matches) {
				const colorize = METHOD_COLORS[ep.method] || chalk.white;
				console.log(`  ${colorize(ep.method.padEnd(7))} ${ep.summary || chalk.gray('(no summary)')}`);
			}

			if (pathParams.length > 0) {
				console.log('');
				console.log(chalk.bold('Path parameters:'));
				for (const param of pathParams) {
					console.log(`  ${chalk.yellow(`{${param}}`)}`);
				}
			}

			console.log('');
			console.log(chalk.gray(`Docs: https://docs.apify.com/api/v2`));
			return;
		}

		simpleLog({ message: `No endpoint found for "${input}".`, stdout: false });

		const suggestions = findClosestEndpoints(endpoints, normalized);
		printSuggestions(suggestions);
	}

	private async print404Suggestions(endpoint: string) {
		try {
			const endpoints = await this.getEndpoints();
			const suggestions = findClosestEndpoints(endpoints, endpoint);
			printSuggestions(suggestions);
		} catch {
			// Silently ignore if we can't fetch the spec for suggestions
			simpleLog({ message: `\n${LIST_ENDPOINTS_HINT}`, stdout: false });
		}
	}
}

async function fetchEndpoints(): Promise<Endpoint[]> {
	let response: Response;

	try {
		response = await fetch(OPENAPI_SPEC_URL);
	} catch (err) {
		throw new Error(`Failed to download the Apify OpenAPI spec from ${OPENAPI_SPEC_URL}: ${(err as Error).message}`);
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

function normalizePath(input: string): string {
	let path = input;

	if (path.startsWith('/')) {
		path = path.slice(1);
	}

	path = path.replace(/^v2\//i, '');

	return path;
}

function filterEndpoints(endpoints: Endpoint[], query: string): Endpoint[] {
	const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

	if (tokens.length === 0) {
		return endpoints;
	}

	return endpoints.filter((ep) => {
		const haystack = `${ep.method} ${ep.path} ${ep.summary}`.toLowerCase();
		return tokens.every((token) => haystack.includes(token));
	});
}

function extractPathParams(path: string): string[] {
	const matches = path.match(/\{([^}]+)\}/g);

	if (!matches) {
		return [];
	}

	return matches.map((m) => m.slice(1, -1));
}

function findClosestEndpoints(endpoints: Endpoint[], input: string, maxPaths = 5): Endpoint[] {
	const normalized = input.toLowerCase();
	const inputSegments = normalized.split('/').filter(Boolean);

	const pathScores = new Map<string, number>();

	for (const ep of endpoints) {
		if (pathScores.has(ep.path)) {
			continue;
		}

		const normalizedEpPath = normalizePath(ep.path).toLowerCase();

		let score = 0;

		if (normalizedEpPath.includes(normalized) || normalized.includes(normalizedEpPath)) {
			score += 10;
		}

		const epSegments = normalizedEpPath.split('/').filter(Boolean);

		const len = Math.min(inputSegments.length, epSegments.length);

		for (let i = 0; i < len; i++) {
			if (epSegments[i] === inputSegments[i]) {
				score += 2;
			} else if (epSegments[i].startsWith('{')) {
				score += 1;
			}
		}

		if (inputSegments.length === epSegments.length) {
			score += 1;
		}

		if (score > 0) {
			pathScores.set(ep.path, score);
		}
	}

	const sortedPaths = [...pathScores.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, maxPaths)
		.map(([path]) => path);

	const pathSet = new Set(sortedPaths);
	const matchedByPath = new Map<string, Endpoint[]>();

	for (const ep of endpoints) {
		if (pathSet.has(ep.path)) {
			const list = matchedByPath.get(ep.path) || [];
			list.push(ep);
			matchedByPath.set(ep.path, list);
		}
	}

	return sortedPaths.flatMap((path) => matchedByPath.get(path) || []);
}
