import chalk from 'chalk';

import { ApifyCommand, StdinMode } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { Flags } from '../lib/command-framework/flags.js';
import { APIFY_CLIENT_DEFAULT_HEADERS } from '../lib/consts.js';
import { error } from '../lib/outputs.js';
import { getApifyClientOptions } from '../lib/utils.js';
import apiEndpoints from './api-endpoints.json' with { type: 'json' };

export class ApiCommand extends ApifyCommand<typeof ApiCommand> {
	static override name = 'api' as const;

	static override description =
		'Makes an authenticated HTTP request to the Apify API and prints the response.\n' +
		'The endpoint can be a relative path (e.g. "v2/acts" or "/v2/acts").\n\n' +
		'Use --list-endpoints to see all available API endpoints.\n' +
		'For full documentation, see https://docs.apify.com/api/v2';

	static override args = {
		endpoint: Args.string({
			required: false,
			description: 'The API endpoint path, e.g. "v2/acts" or "/v2/users/me".',
		}),
	};

	static override flags = {
		method: Flags.string({
			char: 'X',
			description: 'The HTTP method to use.',
			choices: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const,
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
			description: 'Additional HTTP header in "key:value" format.',
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

		if (!this.args.endpoint) {
			this.printHelp();
		}

		const { token } = getApifyClientOptions();

		if (!token) {
			throw new Error('You are not logged in with your Apify account. Call "apify login" to fix that.');
		}

		// Normalize endpoint — strip leading slash
		let endpoint = this.args.endpoint!;

		if (endpoint.startsWith('/')) {
			endpoint = endpoint.slice(1);
		}

		const baseUrl = process.env.APIFY_CLIENT_BASE_URL || 'https://api.apify.com';
		const url = `${baseUrl}/${endpoint}`;

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

		// Make the request
		const response = await fetch(url, {
			method: this.flags.method,
			headers,
			body: this.flags.body || undefined,
		});

		const responseText = await response.text();

		if (!response.ok) {
			process.exitCode = 1;

			try {
				const parsed = JSON.parse(responseText);
				error({ message: `${response.status} ${response.statusText}` });
				console.error(JSON.stringify(parsed, null, 2));
			} catch {
				error({ message: `${response.status} ${response.statusText}: ${responseText}` });
			}

			return;
		}

		if (responseText) {
			try {
				const parsed = JSON.parse(responseText);
				console.log(JSON.stringify(parsed, null, 2));
			} catch {
				console.log(responseText);
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
