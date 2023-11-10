const { cryptoRandomObjectId } = require('@apify/utilities');
const { flags: flagsHelper } = require('@oclif/command');
const computerName = require('computer-name');
const cors = require('cors');
const express = require('express');
const inquirer = require('inquirer');
const open = require('open');

const { ApifyCommand } = require('../lib/apify_command');
const outputs = require('../lib/outputs');
const { useApifyIdentity } = require('../lib/telemetry');
const { getLoggedClient } = require('../lib/utils');
const { getLocalUserInfo } = require('../lib/utils');

const CONSOLE_BASE_URL = 'https://console.apify.com/account?tab=integrations';
// const CONSOLE_BASE_URL = 'http://localhost:3000/account?tab=integrations';
const CONSOLE_URL_ORIGIN = new URL(CONSOLE_BASE_URL).origin;

const API_BASE_URL = CONSOLE_BASE_URL.includes('localhost') ? 'http://localhost:3333' : undefined;

// Not really checked right now, but it might come useful if we ever need to do some breaking changes
const API_VERSION = 'v1';

const tryToLogin = async (token) => {
    const isUserLogged = await getLoggedClient(token, API_BASE_URL);
    const userInfo = getLocalUserInfo();
    if (isUserLogged) {
        await useApifyIdentity(userInfo.id);
        outputs.success(`You are logged in to Apify as ${userInfo.username || userInfo.id}!`);
    } else {
        outputs.error('Login to Apify failed, the provided API token is not valid.');
    }
    return isUserLogged;
};

class LoginNewCommand extends ApifyCommand {
    async run() {
        outputs.warning('This command is still experimental and might break at any time. Use at your own risk.\n');

        const { flags } = this.parse(LoginNewCommand);
        const { token } = flags;
        if (token) {
            return tryToLogin(token);
        }

        const answer = await inquirer.prompt([{
            type: 'list',
            name: 'loginMethod',
            message: 'Choose how you want to log in to Apify',
            choices: [
                { value: 'console', name: 'Through Apify Console in your default browser', short: 'Through Apify Console' },
                { value: 'manual', name: 'Enter API token manually', short: 'Manually' },
            ],
            loop: false,
        }]);

        if (answer.loginMethod === 'console') {
            let server;
            const app = express();

            // To send requests from browser to localhost, CORS has to be configured properly
            app.use(cors({
                origin: CONSOLE_URL_ORIGIN,
                allowedHeaders: ['Content-Type', 'Authorization'],
            }));

            // Turn off keepalive, otherwise closing the server when command is finished is lagging
            app.use((req, res, next) => {
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
                        await tryToLogin(req.body.apiToken);
                    } else {
                        throw new Error('Request did not contain API token');
                    }
                    res.end();
                } catch (err) {
                    const errorMessage = `Login to Apify failed with error: ${err.message}`;
                    outputs.error(errorMessage);
                    res.status(500);
                    res.send(errorMessage);
                }
                server.close();
            });

            apiRouter.post('/exit', (req, res) => {
                if (req.body.isWindowClosed) {
                    outputs.error('Login to Apify failed, the console window was closed.');
                } else if (req.body.actionCanceled) {
                    outputs.error('Login to Apify failed, the action was canceled in the Apify Console.');
                } else {
                    outputs.error('Login to Apify failed.');
                }

                res.end();
                server.close();
            });

            // Listening on port 0 will assign a random available port
            server = app.listen(0);
            const { port } = server.address();

            const consoleUrl = new URL(CONSOLE_BASE_URL);
            consoleUrl.searchParams.set('localCliCommand', 'login');
            consoleUrl.searchParams.set('localCliPort', port);
            consoleUrl.searchParams.set('localCliToken', authToken);
            consoleUrl.searchParams.set('localCliApiVersion', API_VERSION);
            try {
                consoleUrl.searchParams.set('localCliComputerName', encodeURIComponent(computerName()));
            } catch {
                // Ignore errors from fetching computer name as it's not critical
            }

            outputs.info(`Opening Apify Console at "${consoleUrl.href}"...`);
            await open(consoleUrl.href);
        } else {
            const tokenAnswer = await inquirer.prompt([{ name: 'token', message: 'Insert your Apify API token', type: 'password' }]);
            return tryToLogin(tokenAnswer.token);
        }
    }
}

LoginNewCommand.description = 'Logs in to your Apify account using your API token.\nThe API token and other account '
    + 'information is stored in the ~/.apify directory, from where it is read by all other "apify" commands. '
    + 'To log out, call "apify logout".';

LoginNewCommand.flags = {
    token: flagsHelper.string({
        char: 't',
        description: '[Optional] Apify API token',
        required: false,
    }),
};

LoginNewCommand.hidden = true;

module.exports = LoginNewCommand;
