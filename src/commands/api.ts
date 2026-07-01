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
		{
			description: 'Log the resolved outbound method + URL (and response status) to stderr.',
			command: 'apify api users/me --verbose',
		},
		{
			description: 'Follow pagination automatically and print all items as a single JSON array.',
			command: 'apify api acts --paginate',
		},
		{
			description: 'Follow pagination but cap at 200 items.',
			command: 'apify api acts --paginate --paginate-max 200',
		},
		{
			description: 'Hit an unauthenticated URL through the same escape hatch.',
			command:
				'apify api --no-auth https://raw.githubusercontent.com/apify/actor-templates/master/templates/manifest.json',
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
		verbose: Flags.boolean({
			char: 'v',
			description:
				'Print the resolved outbound request (method + URL) to stderr before the fetch, and the ' +
				'HTTP status + Content-Type after. Useful for debugging what the CLI actually sends.',
			default: false,
		}),
		paginate: Flags.boolean({
			description:
				'For endpoints returning { data: { items, total, offset, limit } }, automatically follow ' +
				'pagination by advancing offset until all items are fetched, then emit the collected items ' +
				'as a single JSON array on stdout. Combine with --paginate-max to cap the number of items.',
			default: false,
		}),
		'paginate-max': Flags.integer({
			description: 'When used with --paginate, stop after collecting this many items. Ignored without --paginate.',
			required: false,
		}),
		'no-auth': Flags.boolean({
			description:
				'Skip the Authorization header. Useful for hitting public / auth-less endpoints via the ' +
				'same escape hatch. When the endpoint is an absolute URL (e.g. https://raw.githubusercontent.com/...), ' +
				'the request is sent verbatim; otherwise the endpoint is resolved against the Apify API base URL.',
			default: false,
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

		const { noAuth, verbose, paginate, paginateMax } = this.flags;

		// Resolve the base URL and token. When --no-auth is set we don't require a login;
		// we also allow the endpoint to be an absolute URL so agents can hit auth-less
		// resources (e.g. raw GitHub) through the same escape hatch.
		let token: string | undefined;
		let baseUrl = `${(process.env.APIFY_CLIENT_BASE_URL || 'https://api.apify.com').replace(/\/$/, '')}/v2`;

		if (!noAuth) {
			const apifyClient = await getLoggedClientOrThrow();
			token = apifyClient.token!;
			// apifyClient.baseUrl already ends in "/v2"
			baseUrl = apifyClient.baseUrl;
		}

		const endpointIsAbsolute = /^https?:\/\//i.test(endpointArg);
		const endpointForSuggestions = endpointIsAbsolute ? endpointArg : normalizePath(endpointArg);

		const buildUrl = (extraQuery?: string): string => {
			let url = endpointIsAbsolute ? endpointArg! : `${baseUrl}/${normalizePath(endpointArg!)}`;

			const parts: string[] = [];
			if (queryString) parts.push(queryString);
			if (extraQuery) parts.push(extraQuery);

			if (parts.length > 0) {
				const separator = url.includes('?') ? '&' : '?';
				url = `${url}${separator}${parts.join('&')}`;
			}

			return url;
		};

		// Build headers. Custom headers overwrite defaults case-insensitively so
		// callers can override e.g. Content-Type without creating duplicate entries.
		const headers: Record<string, string> = {
			...APIFY_CLIENT_DEFAULT_HEADERS,
		};

		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}

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

		const doFetch = async (url: string): Promise<{ response: Response; responseText: string }> => {
			if (verbose) {
				simpleLog({ message: chalk.gray(`→ ${method} ${url}`), stdout: false });
			}

			const response = await fetch(url, {
				method,
				headers,
				body: this.flags.body || undefined,
			});

			const responseText = await response.text();

			if (verbose) {
				const contentType = response.headers.get('content-type') || '';
				simpleLog({
					message: chalk.gray(`← ${response.status} ${response.statusText}${contentType ? ` (${contentType})` : ''}`),
					stdout: false,
				});
			}

			return { response, responseText };
		};

		const handleErrorResponse = async (response: Response, responseText: string): Promise<void> => {
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

			if (response.status === 404 && !endpointIsAbsolute) {
				await this.print404Suggestions(endpointForSuggestions);
			}
		};

		// --paginate: only meaningful for GET requests on endpoints that return
		// { data: { items, total, offset, limit } }. Any other shape falls back to
		// a single response and we warn on stderr so callers aren't silently misled.
		if (paginate) {
			if (method !== 'GET') {
				throw new Error('--paginate can only be used with GET requests.');
			}

			const collected: unknown[] = [];
			let offset = 0;
			let limit: number | undefined;
			let total: number | undefined;

			// eslint-disable-next-line no-constant-condition
			while (true) {
				const extra = new URLSearchParams();
				extra.set('offset', String(offset));
				if (limit !== undefined) extra.set('limit', String(limit));
				const url = buildUrl(extra.toString());

				const { response, responseText } = await doFetch(url);

				if (!response.ok) {
					await handleErrorResponse(response, responseText);
					return;
				}

				let parsed: unknown;
				try {
					parsed = JSON.parse(responseText);
				} catch {
					throw new Error('--paginate requires a JSON response body, but got non-JSON content.');
				}

				const data = (parsed as { data?: unknown } | null)?.data as
					| { items?: unknown[]; total?: number; offset?: number; limit?: number; count?: number }
					| undefined;

				if (!data || !Array.isArray(data.items)) {
					throw new Error(
						'--paginate expected a { data: { items: [...] } } response shape from the endpoint. ' +
							'This endpoint does not appear to be paginated — retry without --paginate.',
					);
				}

				const { items } = data;
				const pageCount = items.length;

				for (const item of items) {
					if (paginateMax !== undefined && collected.length >= paginateMax) break;
					collected.push(item);
				}

				if (typeof data.total === 'number') total = data.total;
				if (typeof data.limit === 'number' && limit === undefined) limit = data.limit;

				const nextOffset = offset + (pageCount || (limit ?? 0));

				const reachedCap = paginateMax !== undefined && collected.length >= paginateMax;
				const exhausted = total !== undefined ? nextOffset >= total : pageCount === 0;

				if (reachedCap || exhausted || pageCount === 0) break;

				offset = nextOffset;
			}

			// Emit collected items as one JSON array. This matches the intent
			// documented in the flag description ("emit all items as one JSON array").
			simpleLog({ message: JSON.stringify(collected, null, 2), stdout: true });
			if (verbose) {
				simpleLog({
					message: chalk.gray(
						`  collected ${collected.length}${total !== undefined ? ` of ${total}` : ''} item(s) across pagination`,
					),
					stdout: false,
				});
			}
			return;
		}

		// Single-request path.
		const { response, responseText } = await doFetch(buildUrl());

		if (!response.ok) {
			await handleErrorResponse(response, responseText);
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
