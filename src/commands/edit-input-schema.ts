import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { dirname } from 'path';

import { cryptoRandomObjectId } from '@apify/utilities';
import { Args } from '@oclif/core';
import cors from 'cors';
import detectIndent from 'detect-indent';
import express from 'express';
import open from 'open';

import { ApifyCommand } from '../lib/apify_command.js';
import { LOCAL_CONFIG_PATH } from '../lib/consts.js';
import { readInputSchema } from '../lib/input_schema.js';
import { error, info, success, warning } from '../lib/outputs.js';

const INPUT_SCHEMA_EDITOR_BASE_URL = 'https://apify.github.io/input-schema-editor-react/';
const INPUT_SCHEMA_EDITOR_ORIGIN = new URL(INPUT_SCHEMA_EDITOR_BASE_URL).origin;

// Not really checked right now, but it might come useful if we ever need to do some breaking changes
const API_VERSION = 'v1';

export class EditInputSchemaCommand extends ApifyCommand<typeof EditInputSchemaCommand> {
    static override description = 'Lets you edit your input schema that would be used on the platform in a visual input schema editor.';

    static override args = {
        path: Args.string({
            required: false,
            description: 'Optional path to your INPUT_SCHEMA.json file. If not provided default platform location for input schema is used.',
        }),
    };

    static override hidden = true;

    static override aliases = ['eis'];

    async run() {
        // This call fails if no input schema is found on any of the default locations
        const { inputSchema: existingSchema, inputSchemaPath } = await readInputSchema(this.args.path);

        if (existingSchema && !inputSchemaPath) {
            // If path is not returned, it means the input schema must be directly embedded as object in actor.json
            // TODO - allow editing input schema embedded in actor.json
            throw new Error(`Editing an input schema directly embedded in "${LOCAL_CONFIG_PATH}" is not yet supported.`);
        }

        warning('This command is still experimental and might break at any time. Use at your own risk.\n');
        info(`Editing input schema at "${inputSchemaPath}"...`);

        let server: Server;
        const app = express();

        // To send requests from browser to localhost, CORS has to be configured properly
        app.use(cors({
            origin: INPUT_SCHEMA_EDITOR_ORIGIN,
            allowedHeaders: ['Content-Type', 'Authorization'],
        }));

        // Turn off keepalive, otherwise closing the server when command is finished is lagging
        app.use((_, res, next) => {
            res.set('Connection', 'close');
            next();
        });

        app.use(express.json());

        // Basic authorization via a random token, which is passed to the input schema editor,
        // and that sends it back via the `token` query param, or `Authorization` header
        const authToken = cryptoRandomObjectId();
        app.use((req, res, next) => {
            let { token } = req.query;
            if (!token) {
                const authorizationHeader = req.get('Authorization');
                if (authorizationHeader) {
                    const [schema, tokenFromHeader, ...extra] = authorizationHeader.trim().split(/\s+/);
                    if (schema.toLowerCase() === 'bearer' && tokenFromHeader && extra.length === 0) {
                        token = tokenFromHeader;
                    }
                }
            }

            if (token !== authToken) {
                res.status(401);
                res.send('Authorization failed');
            } else {
                next();
            }
        });

        const apiRouter = express.Router();
        app.use(`/api/${API_VERSION}`, apiRouter);

        // We detect the format of the input schema JSON, so that updating it does not cause too many changes
        let jsonIndentation = '    ';
        let appendFinalNewline = true;

        apiRouter.get('/input-schema', (_, res) => {
            let inputSchemaStr;
            try {
                inputSchemaStr = existsSync(inputSchemaPath) ? readFileSync(inputSchemaPath, { encoding: 'utf-8' }) : '{}\n';
                if (inputSchemaStr.length > 3) {
                    jsonIndentation = detectIndent(inputSchemaStr).indent || jsonIndentation;
                }
                if (inputSchemaStr) {
                    appendFinalNewline = inputSchemaStr[inputSchemaStr.length - 1] === '\n';
                }
                if (existsSync(inputSchemaPath)) {
                    info(`Input schema loaded from "${inputSchemaPath}"`);
                } else {
                    info(`Empty input schema initialized.`);
                }
            } catch (err) {
                const errorMessage = `Reading input schema from disk failed with: ${(err as Error).message}`;
                error(errorMessage);
                res.status(500);
                res.send(errorMessage);
                return;
            }

            let inputSchemaObj;
            try {
                inputSchemaObj = JSON.parse(inputSchemaStr || '{}');
            } catch (err) {
                const errorMessage = `Parsing input schema failed with error: ${(err as Error).message}`;
                error(errorMessage);
                res.status(500);
                res.send(errorMessage);
                return;
            }

            res.send(inputSchemaObj);
            info('Input schema sent to editor.');
        });

        apiRouter.post('/input-schema', (req, res) => {
            try {
                info('Got input schema from editor...');
                const inputSchemaObj = req.body;
                let inputSchemaStr = JSON.stringify(inputSchemaObj, null, jsonIndentation);
                if (appendFinalNewline) inputSchemaStr += '\n';

                const inputSchemaDir = dirname(inputSchemaPath);
                if (!existsSync(inputSchemaDir)) {
                    mkdirSync(inputSchemaDir, { recursive: true });
                }

                writeFileSync(inputSchemaPath, inputSchemaStr, { encoding: 'utf-8', flag: 'w+' });
                res.end();
                info('Input schema saved to disk.');
            } catch (err) {
                const errorMessage = `Saving input schema failed with error: ${(err as Error).message}`;
                error(errorMessage);
                res.status(500);
                res.send(errorMessage);
            }
        });

        apiRouter.post('/exit', (req, res) => {
            if (req.body.isWindowClosed) {
                info('Editor closed, finishing...');
            } else {
                info('Editing finished, you can close the editor.');
            }
            res.end();
            server.close(() => success('Done.'));
        });

        // Listening on port 0 will assign a random available port
        server = app.listen(0);
        const { port } = server.address() as AddressInfo;
        info(`Listening for messages from input schema editor on port ${port}...`);

        const editorUrl = `${INPUT_SCHEMA_EDITOR_BASE_URL}?localCliPort=${port}&localCliToken=${authToken}&localCliApiVersion=${API_VERSION}`;
        info(`Opening input schema editor at "${editorUrl}"...`);
        await open(editorUrl);
    }
}
