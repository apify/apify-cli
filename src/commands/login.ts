import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import chalk from 'chalk';
import computerName from 'computer-name';
import cors from 'cors';
import express from 'express';
import open from 'open';

import { cryptoRandomObjectId } from '@apify/utilities';

import { getLoggedClient } from '../lib/authFile.js';
import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Flags } from '../lib/command-framework/flags.js';
import { AUTH_FILE_PATH } from '../lib/consts.js';
import { updateUserId } from '../lib/hooks/telemetry/useTelemetryState.js';
import { useMaskedInput } from '../lib/hooks/user-confirmations/useMaskedInput.js';
import { useSelectFromList } from '../lib/hooks/user-confirmations/useSelectFromList.js';
import { error, info, success } from '../lib/outputs.js';
import { tildify } from '../lib/utils.js';

const CONSOLE_URL_ORIGIN = 'https://console.apify.com';
const LOCALHOST_URL_ORIGIN = 'http://localhost:3000';
const CONSOLE_LOGIN_PATH = '/settings/integrations';

// Not really checked right now, but it might come useful if we ever need to do some breaking changes
const API_VERSION = 'v1';

const tryToLogin = async (token: string, baseUrl: string | undefined) => {
	const client = await getLoggedClient({
		token,
		baseUrl,
		storeAsNewUser: true,
	});

	if (client) {
		const userInfo = await client.user('me').get();
		await updateUserId(userInfo.id!);

		success({
			message: `You are logged in to Apify as ${userInfo.username || userInfo.id}. ${chalk.gray(`Your token is stored at ${AUTH_FILE_PATH()}.`)}`,
		});
	} else {
		error({
			message: 'Login to Apify failed, the provided API token is not valid.',
		});
	}
	return client;
};

export class LoginCommand extends ApifyCommand<typeof LoginCommand> {
	static override name = 'login' as const;

	static override description =
		`Authenticates your Apify account and saves credentials to '${tildify(AUTH_FILE_PATH())}'.\n` +
		`All other commands use these stored credentials.\n\n` +
		`Run 'apify logout' to remove authentication.`;

	static override flags = {
		token: Flags.string({
			char: 't',
			description: 'Apify API token',
			required: false,
		}),
		method: Flags.string({
			char: 'm',
			description: 'Method of logging in to Apify',
			choices: ['console', 'manual'],
			required: false,
		}),
		alternativeUrl: Flags.string({
			description: '[Apify developers only] Alternative API URL to use with this account.',
			required: false,
			hidden: true,
		}),
	};

	async run() {
		const { token, method, alternativeUrl } = this.flags;

		if (token) {
			await tryToLogin(token, alternativeUrl);
			return;
		}

		let selectedMethod = method;

		if (!method) {
			const answer = await useSelectFromList({
				message: 'Choose how you want to log in to Apify',
				choices: [
					{
						value: 'console',
						name: 'Through Apify Console in your default browser',
						short: 'Through Apify Console',
					},
					{
						value: 'manual',
						name: 'Enter API token manually',
						short: 'Manually',
					},
				] as const,
				loop: true,
			});

			selectedMethod = answer;
		}

		if (selectedMethod === 'console') {
			const isLocalhost = alternativeUrl?.includes('localhost');
			if (alternativeUrl && !isLocalhost)
				throw new Error(
					'The interactive login can only be used with prod or localhost backends, other deployments are currently not supported',
				);

			const consoleOrigin = isLocalhost ? LOCALHOST_URL_ORIGIN : CONSOLE_URL_ORIGIN;

			let server: Server;
			const app = express();

			// To send requests from browser to localhost, CORS has to be configured properly
			app.use(
				cors({
					origin: consoleOrigin,
					allowedHeaders: ['Content-Type', 'Authorization'],
				}),
			);

			// Turn off keepalive, otherwise closing the server when command is finished is lagging
			app.use((_, res, next) => {
				res.set('Connection', 'close');
				next();
			});

			app.use(express.json());

			// Basic authorization via a random token, which is passed to the Apify Console,
			// and that sends it back via the `token` query param, or `Authorization` header
			const authToken = cryptoRandomObjectId();
			app.use((req, res, next) => {
				let { token: serverToken } = req.query;
				if (!serverToken) {
					const authorizationHeader = req.get('Authorization');
					if (authorizationHeader) {
						const [schema, tokenFromHeader, ...extra] = authorizationHeader.trim().split(/\s+/);
						if (schema.toLowerCase() === 'bearer' && tokenFromHeader && extra.length === 0) {
							serverToken = tokenFromHeader;
						}
					}
				}

				if (serverToken !== authToken) {
					res.status(401);
					res.send('Authorization failed');
				} else {
					next();
				}
			});

			const apiRouter = express.Router();
			app.use(`/api/${API_VERSION}`, apiRouter);

			apiRouter.post('/login-token', async (req, res) => {
				try {
					if (req.body.apiToken) {
						await tryToLogin(req.body.apiToken, alternativeUrl);
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
			});

			apiRouter.post('/exit', (req, res) => {
				if (req.body.isWindowClosed) {
					error({
						message: 'Login to Apify failed, the console window was closed.',
					});
				} else if (req.body.actionCanceled) {
					error({
						message: 'Login to Apify failed, the action was canceled in the Apify Console.',
					});
				} else {
					error({ message: 'Login to Apify failed.' });
				}

				res.end();
				server.close();
			});

			// Listening on port 0 will assign a random available port
			server = app.listen(0);
			const { port } = server.address() as AddressInfo;

			const consoleUrl = new URL(CONSOLE_LOGIN_PATH, consoleOrigin);
			consoleUrl.searchParams.set('localCliCommand', 'login');
			consoleUrl.searchParams.set('localCliPort', `${port}`);
			consoleUrl.searchParams.set('localCliToken', authToken);
			consoleUrl.searchParams.set('localCliApiVersion', API_VERSION);
			try {
				consoleUrl.searchParams.set('localCliComputerName', encodeURIComponent(computerName()));
			} catch {
				// Ignore errors from fetching computer name as it's not critical
			}

			info({ message: `Opening Apify Console at "${consoleUrl.href}"...` });
			await open(consoleUrl.href);
		} else {
			console.log(
				'Enter your Apify API token. You can find it at https://console.apify.com/settings/integrations',
			);

			const tokenAnswer = await useMaskedInput({ message: 'token:' });
			await tryToLogin(tokenAnswer, alternativeUrl);
		}
	}
}
