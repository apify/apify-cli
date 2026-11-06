import { once } from 'node:events';
import process from 'node:process';

import { ApifyCommand, StdinMode } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import {
	HTTP_METHODS,
	mergeHeaders,
	METHODS_WITHOUT_BODY,
	parseHeaders,
	parseParams,
} from '../../lib/commands/http-request.js';
import { APIFY_CLIENT_DEFAULT_HEADERS, CommandExitCodes } from '../../lib/consts.js';
import { error, info, simpleLog, warning } from '../../lib/outputs.js';
import {
	describeServerError,
	isMultiTenant,
	parseServerRequestArgs,
	resolveServerActor,
	resolveServerRequestUrl,
	SERVER_REQUEST_TIMEOUT_MILLIS,
} from '../../lib/server-actor.js';
import { getCurrentUserInfo, getLoggedClientOrThrow } from '../../lib/utils.js';

const SLOW_RESPONSE_NOTICE_MILLIS = 2_000;

export class ServerRequestCommand extends ApifyCommand<typeof ServerRequestCommand> {
	static override name = 'request' as const;

	static override enableProfileFlag = true;

	static override description =
		"Sends an authenticated HTTP request to a Server Actor's server interface and prints the response.\n" +
		'The host always comes from the Actor; pass a path, never a full URL. ' +
		'The API token is sent in the Authorization header and never reaches the Actor.';

	static override examples = [
		{
			description: 'Send a GET request (the default method).',
			command: 'apify server request apify/rag-web-browser /search -p \'{"query":"apify"}\'',
		},
		{
			description: 'Send a POST request with a JSON body.',
			command: `apify server request POST apify/web-fetch / -d '{"url":"https://example.com"}'`,
		},
		{
			description: 'Call the Actor in the current directory.',
			command: 'apify server request /health',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-server-request';

	static override args = {
		methodOrTarget: Args.string({
			description: 'The HTTP method (defaults to GET), or the Actor when the method is omitted.',
		}),
		targetOrPath: Args.string({
			description: 'The Actor ID or "username/name" (defaults to the Actor in the current directory), or the path.',
		}),
		path: Args.string({
			description: 'The path on the Actor\'s server, starting with "/". Defaults to "/".',
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
			description: 'The request body. Use "-" to read from stdin.',
			required: false,
			stdin: StdinMode.Stringified,
		}),
		header: Flags.string({
			char: 'H',
			description:
				'Additional HTTP header(s). Pass a single "key:value" string, or a JSON object ' +
				'like \'{"X-Foo": "bar", "X-Baz": "qux"}\' to send multiple headers.',
			required: false,
		}),
		params: Flags.string({
			char: 'p',
			description: 'Query parameters as a JSON object, e.g. \'{"query": "apify"}\'.',
			required: false,
		}),
	};

	async run() {
		const parsed = parseServerRequestArgs([this.args.methodOrTarget, this.args.targetOrPath, this.args.path]);
		const explicitMethodFlag = this.flags.method?.toUpperCase();

		if (parsed.method && explicitMethodFlag && parsed.method !== explicitMethodFlag) {
			throw new Error(
				`Conflicting HTTP methods: positional "${parsed.method}" vs --method "${explicitMethodFlag}". ` +
					'Please specify the method only once.',
			);
		}

		const method = parsed.method ?? explicitMethodFlag ?? 'GET';
		const queryString = parseParams(this.flags.params);
		const customHeaders = parseHeaders(this.flags.header);
		const { body } = this.flags;

		if (body && METHODS_WITHOUT_BODY.has(method)) {
			throw new Error(`HTTP ${method} requests cannot have a request body. Use POST, PUT or PATCH, or omit --body.`);
		}

		const client = await getLoggedClientOrThrow();
		const actor = await resolveServerActor(client, parsed.target);
		const url = resolveServerRequestUrl(actor.standbyUrl, parsed.path, queryString);

		// Single-tenant is the platform default; only multi-tenant Actors run in the developer's account.
		if (!isMultiTenant(actor)) {
			const { username } = await getCurrentUserInfo();
			info({
				message: `${actor.userFriendlyId} is single-tenant: it runs in account "${username}", which pays the platform usage.`,
			});
		}

		const defaultHeaders: Record<string, string> = {
			...APIFY_CLIENT_DEFAULT_HEADERS,
			Authorization: `Bearer ${client.token!}`,
		};

		if (body) {
			defaultHeaders['Content-Type'] = isJson(body) ? 'application/json' : 'text/plain; charset=utf-8';
		}

		const headers = mergeHeaders(defaultHeaders, customHeaders);

		// The timeout covers the wait for the response head only; a streamed body may legitimately take longer.
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), SERVER_REQUEST_TIMEOUT_MILLIS);
		const slowNotice = setTimeout(() => {
			info({
				message: 'Waiting for the Actor. If no run is ready, the platform starts one, which can take up to 2 minutes.',
			});
		}, SLOW_RESPONSE_NOTICE_MILLIS);

		let response: Response;

		try {
			response = await fetch(url, {
				method,
				headers,
				body: body || undefined,
				// The Actor controls redirects; following one could send the token to another host.
				redirect: 'manual',
				signal: controller.signal,
			});
		} catch (err) {
			if (controller.signal.aborted) {
				throw new Error('The Actor did not respond within 5 minutes.');
			}

			throw err;
		} finally {
			clearTimeout(timeout);
			clearTimeout(slowNotice);
		}

		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get('location');
			warning({
				message: `${response.status} ${response.statusText}. Not following the redirect${location ? ` to ${location}` : ''}.`,
			});
		}

		if (response.status >= 400) {
			process.exitCode = CommandExitCodes.RunFailed;

			const responseText = await response.text();
			error({ message: `${response.status} ${response.statusText}` });

			const hint = describeServerError(response.status, responseText);

			if (hint) {
				simpleLog({ message: hint });
			}

			if (responseText) {
				process.stdout.write(responseText);
				endLineOnTerminal(responseText.endsWith('\n'));
			}

			return;
		}

		if (!response.body) {
			return;
		}

		let lastByte: number | undefined;

		for await (const chunk of response.body) {
			if (chunk.length > 0) {
				lastByte = chunk[chunk.length - 1];
			}

			if (!process.stdout.write(chunk)) {
				await once(process.stdout, 'drain');
			}
		}

		endLineOnTerminal(lastByte === undefined || lastByte === 0x0a);
	}
}

// Without a final newline the shell prompt lands on the body's last line; pipes still get the exact bytes.
function endLineOnTerminal(endsWithNewline: boolean) {
	if (process.stdout.isTTY && !endsWithNewline) {
		process.stdout.write('\n');
	}
}

function isJson(text: string) {
	try {
		JSON.parse(text);
		return true;
	} catch {
		return false;
	}
}
