import type { AddressInfo } from 'node:net';

import computerName from 'computer-name';
import open from 'open';

import { cryptoRandomObjectId } from '@apify/utilities';

import { getConsoleIntegrationsUrl, getConsoleUrl } from '../console-url.js';
import { createLocalApiServer } from '../local-api-server.js';
import { info } from '../outputs.js';
import { cliDebugPrint } from '../utils/cliDebugPrint.js';
import type { GitProvider } from './gitSource.js';

// Matches the version `apify login` serves its loopback routes under; Console reads it from the
// `localCliApiVersion` query param and builds the callback URL from it.
const API_VERSION = 'v1';

const CONNECT_TIMEOUT_MS = 5 * 60_000;

export type ConnectViaConsoleResult =
	| { connected: true }
	| { stopReason: 'connectCancelled' | 'connectTimedOut'; message: string };

/**
 * Connects a git provider that the CLI cannot authorize on its own.
 *
 * GitHub is a public OAuth app, so the CLI builds its authorize URL directly. GitLab and Bitbucket are
 * `UserIntegration` documents whose CSRF `state` is minted and stored server-side, so the browser has to
 * start the flow. Console does that and reports back to a loopback server here, the same hand-off
 * `apify login` uses.
 *
 * The caller re-reads the integration list afterwards, so the reported id is only logged.
 */
export const connectViaConsole = async (provider: GitProvider, label: string): Promise<ConnectViaConsoleResult> => {
	const consoleUrl = getConsoleUrl();
	const authToken = cryptoRandomObjectId();

	let resolve!: (result: ConnectViaConsoleResult) => void;
	const finished = new Promise<ConnectViaConsoleResult>((resolveFinished) => {
		resolve = resolveFinished;
	});

	const server = createLocalApiServer({
		// Only the origin, matching `apify login`: it is compared against the browser's Origin header.
		corsOrigin: new URL(consoleUrl).origin,
		authToken,
		routes: {
			[`POST /api/${API_VERSION}/git-provider-connected`]: (body, res) => {
				res.end();
				cliDebugPrint('git-source', 'connected', body);
				resolve({ connected: true });
			},
			[`POST /api/${API_VERSION}/exit`]: (body, res) => {
				res.end();
				resolve({
					stopReason: 'connectCancelled',
					message: body.isWindowClosed
						? `Connecting your ${label} account stopped: the Apify Console window was closed.`
						: `Connecting your ${label} account was canceled in Apify Console.`,
				});
			},
		},
	});

	const timer = setTimeout(
		() =>
			resolve({
				stopReason: 'connectTimedOut',
				message: `Connecting your ${label} account did not finish within ${CONNECT_TIMEOUT_MS / 60_000} minutes.`,
			}),
		CONNECT_TIMEOUT_MS,
	);

	// Port 0 assigns a random free port.
	server.listen(0);
	const { port } = server.address() as AddressInfo;

	const url = new URL(getConsoleIntegrationsUrl());
	url.searchParams.set('localCliCommand', 'connect-git-provider');
	url.searchParams.set('gitProvider', provider);
	url.searchParams.set('localCliPort', `${port}`);
	url.searchParams.set('localCliToken', authToken);
	url.searchParams.set('localCliApiVersion', API_VERSION);
	try {
		url.searchParams.set('localCliComputerName', encodeURIComponent(computerName()));
	} catch {
		// Not critical, and it only labels the request in Console.
	}

	info({ message: `Connect your ${label} account to Apify: ${url.href}` });
	// Printed above as well — a headless session, or a machine with no usable default browser, still needs it.
	open(url.href).catch(() => undefined);
	info({ message: 'Waiting for the connection to complete in your browser...' });

	try {
		return await finished;
	} finally {
		clearTimeout(timer);
		// `close` alone waits for open sockets, and the browser can leave one behind. This runs at the
		// start of `apify create`, so a stray handle would hang the command long after its work is done.
		server.closeAllConnections();
		server.close();
	}
};
