import chalk from 'chalk';

import { ApifyCommand, StdinMode } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { Flags } from '../lib/command-framework/flags.js';
import { APIFY_CLIENT_DEFAULT_HEADERS, CommandExitCodes } from '../lib/consts.js';
import { error, simpleLog } from '../lib/outputs.js';
import { getLoggedClientOrThrow } from '../lib/utils.js';
import apiEndpoints from './api-endpoints.json' with { type: 'json' };

const HTTP_METHODS: string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

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
			description: 'The HTTP method to use.',
			choices: HTTP_METHODS,
			default: 'GET',
		}),
		body: Flags.string({
			char: 'd',
			description: 'The request body (JSON string). Use "-" to read from stdin.',
			required: false,
			stdin: StdinMode.Stringified,
		}),
		header: Flags.string({
			char: 'H',
			description: 'Additional HTTP header in "key:value" format (only one header supported).',
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
			this.printEndpoints();
			return;
		}

		// Support "apify api GET /v2/users/me" syntax — if the first arg is an HTTP method,
		// use it as the method and the second arg as the endpoint
		let { method } = this.flags;
		let endpointArg = this.args.methodOrEndpoint;

		if (endpointArg && HTTP_METHODS.includes(endpointArg.toUpperCase())) {
			method = endpointArg.toUpperCase();
			endpointArg = this.args.endpoint;
		}

		if (!endpointArg) {
			this.printHelp();
			return;
		}

		const apifyClient = await getLoggedClientOrThrow();
		const token = apifyClient.token!;

		// Normalize endpoint — strip leading slash and ensure v2 prefix
		let endpoint = endpointArg;

		if (endpoint.startsWith('/')) {
			endpoint = endpoint.slice(1);
		}

		// Auto-prepend "v2/" if the endpoint doesn't already include it,
		// since all Apify API endpoints are under /v2/
		if (!endpoint.startsWith('v2/')) {
			endpoint = `v2/${endpoint}`;
		}

		const baseUrl = process.env.APIFY_CLIENT_BASE_URL || 'https://api.apify.com';
		let url = `${baseUrl}/${endpoint}`;

		// Append query params from --params flag
		if (this.flags.params) {
			let paramsObj: Record<string, unknown>;

			try {
				paramsObj = JSON.parse(this.flags.params);
			} catch {
				throw new Error('Invalid JSON in --params flag. Please provide a valid JSON object, e.g. \'{"limit": 1}\'.');
			}

			const searchParams = new URLSearchParams();

			for (const [key, value] of Object.entries(paramsObj)) {
				searchParams.append(key, String(value));
			}

			const separator = url.includes('?') ? '&' : '?';
			url = `${url}${separator}${searchParams.toString()}`;
		}

		// Build headers
		const headers: Record<string, string> = {
			...APIFY_CLIENT_DEFAULT_HEADERS,
			Authorization: `Bearer ${token}`,
		};

		if (this.flags.body) {
			headers['Content-Type'] = 'application/json';
		}

		if (this.flags.header) {
			const colonIndex = this.flags.header.indexOf(':');

			if (colonIndex === -1) {
				throw new Error('Header must be in "key:value" format.');
			}

			headers[this.flags.header.slice(0, colonIndex).trim()] = this.flags.header.slice(colonIndex + 1).trim();
		}

		// Validate body is valid JSON before sending
		if (this.flags.body) {
			try {
				JSON.parse(this.flags.body);
			} catch {
				throw new Error('Invalid JSON in --body flag. Please provide a valid JSON string.');
			}
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

			try {
				const parsed = JSON.parse(responseText);
				error({ message: `${response.status} ${response.statusText}` });
				simpleLog({ message: JSON.stringify(parsed, null, 2), stdout: false });
			} catch {
				error({ message: `${response.status} ${response.statusText}: ${responseText}` });
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

	private printEndpoints() {
		const methodColors: Record<string, (text: string) => string> = {
			GET: chalk.green,
			POST: chalk.yellow,
			PUT: chalk.blue,
			PATCH: chalk.cyan,
			DELETE: chalk.red,
		};

		for (const { method, path, summary } of apiEndpoints) {
			const colorize = methodColors[method] || chalk.white;
			const methodStr = colorize(method.padEnd(7));
			const summaryStr = summary ? chalk.gray(` ${summary}`) : '';

			console.log(`${methodStr} ${path}${summaryStr}`);
		}
	}
}
