import type { AddressInfo } from 'node:net';
import process from 'node:process';

import chalk from 'chalk';
import computerName from 'computer-name';
import open from 'open';

import { cryptoRandomObjectId } from '@apify/utilities';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { getConsoleIntegrationsUrl, getConsoleUrl } from '../../lib/console-url.js';
import { AUTH_FILE_PATH, INTERRUPT_SIGNALS } from '../../lib/consts.js';
import { getBackend } from '../../lib/credentials.js';
import { updateUserId } from '../../lib/hooks/telemetry/useTelemetryState.js';
import { useMaskedInput } from '../../lib/hooks/user-confirmations/useMaskedInput.js';
import { useSignalHandler } from '../../lib/hooks/useSignalHandler.js';
import { createLocalApiServer } from '../../lib/local-api-server.js';
import { loginWithAuthorizationCode } from '../../lib/oauth/authorization-code.js';
import { getOAuthClientId, getOAuthIssuerUrl } from '../../lib/oauth/consts.js';
import { loginWithDeviceCode } from '../../lib/oauth/device-code.js';
import { type AuthorizationServerMetadata, fetchAuthorizationServerMetadata } from '../../lib/oauth/discovery.js';
import { clearOAuthSession, saveOAuthSession } from '../../lib/oauth/session.js';
import type { TokenResponse } from '../../lib/oauth/token-endpoint.js';
import { error, info, success } from '../../lib/outputs.js';
import { getLocalUserInfo, getLoggedClient, tildify } from '../../lib/utils.js';
import { cliDebugPrint } from '../../lib/utils/cliDebugPrint.js';

// When logging in against a local Console instance (local platform development), validate the token
// against the local API rather than production.
const LOCAL_API_BASE_URL = 'http://localhost:3333';

// Not really checked right now, but it might come useful if we ever need to do some breaking changes
const API_VERSION = 'v1';

const getApiBaseUrlForLogin = () => (getConsoleUrl().includes('localhost') ? LOCAL_API_BASE_URL : undefined);

const describeTokenLocation = async () => {
	const backend = await getBackend();
	if (backend === 'keyring') return 'your OS keyring';
	if (process.env.APIFY_DISABLE_KEYRING === '1') {
		return `${AUTH_FILE_PATH()} (OS keyring disabled via APIFY_DISABLE_KEYRING)`;
	}
	return `${AUTH_FILE_PATH()} (OS keyring unavailable; set APIFY_DISABLE_KEYRING=1 to silence)`;
};

const reportLoginSuccess = async ({ refreshes }: { refreshes: boolean }) => {
	const userInfo = await getLocalUserInfo();
	await updateUserId(userInfo.id!);

	const tokenLocation = await describeTokenLocation();
	const detail = refreshes
		? `Your session refreshes automatically; the token is stored in ${tokenLocation}.`
		: `Your token is stored in ${tokenLocation}.`;

	success({
		message: `You are logged in to Apify as ${userInfo.username || userInfo.id}. ${chalk.gray(detail)}`,
	});
};

/** Logs in with a plain API token. Drops any OAuth session so stale refresh state cannot outlive the token switch. */
const tryToLogin = async (token: string) => {
	await clearOAuthSession();

	const isUserLogged = await getLoggedClient(token, getApiBaseUrlForLogin());

	if (isUserLogged) {
		await reportLoginSuccess({ refreshes: false });
	} else {
		error({
			message: 'Login to Apify failed, the provided API token is not valid.',
		});
	}
	return isUserLogged;
};

export class AuthLoginCommand extends ApifyCommand<typeof AuthLoginCommand> {
	static override name = 'login' as const;

	static override description =
		`Authenticates your Apify account and saves credentials to '${tildify(AUTH_FILE_PATH())}'.\n` +
		`All other commands use these stored credentials.\n\n` +
		`By default, the login is confirmed in Apify Console in your browser by putting in a code. ` +
		`Run 'apify logout' to remove authentication.`;

	static override group = 'Authentication';

	static override interactive = true;

	static override interactiveNote =
		'Opens Apify Console in your browser to confirm the login. To run non-interactively, pass --token <api-token>.';

	static override examples = [
		{
			description: 'Log in by confirming the request in Apify Console in your browser.',
			command: 'apify login',
		},
		{
			description: 'Log in non-interactively with an API token.',
			command: 'apify login --token apify_api_xxxxx',
		},
		{
			description: 'Log in through the legacy Apify Console hand-off.',
			command: 'apify login --method console',
		},
		{
			description: 'Type an API token into a prompt.',
			command: 'apify login --method manual',
		},
		{
			description: 'Log in on a remote machine by confirming the request in Apify Console in your browser.',
			command: 'apify login --method oauth2',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-login';

	static override flags = {
		token: Flags.string({
			char: 't',
			description: 'Apify API token.',
			required: false,
		}),
		method: Flags.string({
			char: 'm',
			description: `Method of logging in to Apify. The default method ('oauth2') confirms the login in Apify Console by putting in a code. The 'manual' method prompts for an API token. The 'console' method uses the legacy Console hand-off, which is deprecated.`,
			choices: ['oauth2', 'console', 'manual'] as const,
			default: 'oauth2' as const,
			required: false,
		}),
	};

	async run() {
		const { token, method } = this.flags;

		if (token) {
			this.telemetryData.login = { method: 'token' };
			await tryToLogin(token);
			return;
		}

		switch (method) {
			case 'manual':
				await this.loginManually();
				break;
			case 'console':
				this.telemetryData.login = { method: 'console' };
				await this.loginViaLegacyConsole();
				break;
			default:
				await this.loginViaOAuth();
		}
	}

	private async loginManually() {
		this.telemetryData.login = { method: 'manual' };

		console.log(`Enter your Apify API token. You can find it at ${getConsoleIntegrationsUrl()}`);

		const tokenAnswer = await useMaskedInput({ message: 'token:' });
		await tryToLogin(tokenAnswer);
	}

	private async loginViaOAuth() {
		const issuer = getOAuthIssuerUrl();
		const clientId = getOAuthClientId();

		let metadata: AuthorizationServerMetadata;
		try {
			metadata = await fetchAuthorizationServerMetadata(issuer);
		} catch (err) {
			cliDebugPrint('oauth', 'discovery failed', err);
			info({ message: 'OAuth login is not available for the Apify Console. Using the Console login instead.' });
			this.telemetryData.login = { method: 'console', fellBackFrom: 'oauth2-discovery' };
			await this.loginViaLegacyConsole();
			return;
		}

		// Ctrl+C while waiting for the browser stops the polling and closes the loopback server. The
		// authorization server has no cancel endpoint, so a pending device code simply lapses on its own.
		const cancellation = new AbortController();
		using _signalHandler = useSignalHandler({
			signals: INTERRUPT_SIGNALS,
			handler: () => cancellation.abort(),
		});

		this.telemetryData.login = { method: 'oauth2-device' };
		const device = await loginWithDeviceCode({
			metadata,
			clientId,
			signal: cancellation.signal,
			onPrompt: ({ verificationUri, verificationUriComplete, userCode }) => {
				const url = verificationUriComplete ?? verificationUri;

				const messageParts = [
					`${chalk.white('Info:')} Opening Apify Console to confirm your login...`,
					'',
					chalk.gray(`If the browser does not open, visit ${chalk.bold(url)} and approve the login.`),
					'',
					chalk.gray(`If prompted, enter the code ${chalk.reset.bold(userCode)}.`),
					'',
					`${chalk.white('Info:')} Waiting for you to confirm the login in your browser...`,
				];

				info({ message: messageParts.join('\n') });

				// Printed above as well — a headless session, or a machine with no usable default browser, still needs it.
				open(url).catch((err) => cliDebugPrint('oauth', 'could not open the browser', err));
			},
		});

		if ('tokens' in device) {
			await this.finishOAuthLogin(device.tokens, metadata, clientId);
			return;
		}

		if ('stopReason' in device) {
			this.reportStoppedLogin(device);
			return;
		}

		cliDebugPrint('oauth', 'device code flow unavailable', device.reason);
		info({ message: 'Device code login is not available. Opening the Apify Console sign-in page instead.' });

		this.telemetryData.login = { method: 'oauth2-code', fellBackFrom: 'oauth2-device' };
		const code = await loginWithAuthorizationCode({
			metadata,
			clientId,
			signal: cancellation.signal,
			onPrompt: (authorizeUrl) => {
				info({ message: `Opening Apify Console at "${authorizeUrl}"...` });
				open(authorizeUrl).catch((err) => cliDebugPrint('oauth', 'could not open the browser', err));
				info({ message: 'Waiting for you to confirm the login in your browser...' });
			},
		});

		if ('tokens' in code) {
			await this.finishOAuthLogin(code.tokens, metadata, clientId);
			return;
		}

		if ('stopReason' in code) {
			this.reportStoppedLogin(code);
			return;
		}

		cliDebugPrint('oauth', 'authorization code flow unavailable', code.reason);
		info({ message: 'Browser login is not available. Using the Console login instead.' });
		this.telemetryData.login = { method: 'console', fellBackFrom: 'oauth2-code' };
		await this.loginViaLegacyConsole();
	}

	private reportStoppedLogin({ stopReason, message }: { stopReason: string; message: string }) {
		if (stopReason === 'aborted') {
			info({ message: 'Login cancelled.' });
		} else {
			error({ message });
		}
		process.exitCode = 1;
	}

	private async finishOAuthLogin(tokens: TokenResponse, metadata: AuthorizationServerMetadata, clientId: string) {
		// The session goes first: if validating the token below fails half-way, the next command can still refresh.
		await saveOAuthSession(tokens, {
			issuer: metadata.issuer,
			clientId,
			tokenEndpoint: metadata.token_endpoint,
		});

		const isUserLogged = await getLoggedClient(tokens.access_token, getApiBaseUrlForLogin());

		if (!isUserLogged) {
			await clearOAuthSession();
			error({ message: 'Login to Apify failed, the token issued by Apify Console was not accepted by the Apify API.' });
			process.exitCode = 1;
			return;
		}

		await reportLoginSuccess({ refreshes: true });
	}

	/** The pre-OAuth hand-off: Console pushes an API token to a loopback server started here. */
	private async loginViaLegacyConsole() {
		const consoleOrigin = new URL(getConsoleUrl()).origin;

		// Basic authorization via a random token, which is passed to the Apify Console,
		// and that sends it back via the `token` query param, or `Authorization` header
		const authToken = cryptoRandomObjectId();

		const server = createLocalApiServer({
			corsOrigin: consoleOrigin,
			authToken,
			routes: {
				[`POST /api/${API_VERSION}/login-token`]: async (body, res) => {
					try {
						if (body.apiToken) {
							await tryToLogin(body.apiToken);
						} else {
							throw new Error('Request did not contain API token');
						}
						res.end();
					} catch (err) {
						const errorMessage = `Login to Apify failed with error: ${(err as Error).message}`;
						error({ message: errorMessage });
						res.status(500);
						res.send(errorMessage);
					}
					server.close();
				},
				[`POST /api/${API_VERSION}/exit`]: (body, res) => {
					if (body.isWindowClosed) {
						error({
							message: 'Login to Apify failed, the console window was closed.',
						});
					} else if (body.actionCanceled) {
						error({
							message: 'Login to Apify failed, the action was canceled in the Apify Console.',
						});
					} else {
						error({ message: 'Login to Apify failed.' });
					}

					res.end();
					server.close();
				},
			},
		});

		// Listening on port 0 will assign a random available port
		server.listen(0);
		const { port } = server.address() as AddressInfo;

		const loginUrl = new URL(getConsoleIntegrationsUrl());
		loginUrl.searchParams.set('localCliCommand', 'login');
		loginUrl.searchParams.set('localCliPort', `${port}`);
		loginUrl.searchParams.set('localCliToken', authToken);
		loginUrl.searchParams.set('localCliApiVersion', API_VERSION);
		try {
			loginUrl.searchParams.set('localCliComputerName', encodeURIComponent(computerName()));
		} catch {
			// Ignore errors from fetching computer name as it's not critical
		}

		info({ message: `Opening Apify Console at "${loginUrl.href}"...` });
		await open(loginUrl.href);
	}
}
