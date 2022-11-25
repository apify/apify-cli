const fs = require('fs');

const cors = require('cors');
const detectIndent = require('detect-indent');
const express = require('express');
const open = require('open');

const { cryptoRandomObjectId } = require('@apify/utilities');

const { ApifyCommand } = require('../lib/apify_command');
const outputs = require('../lib/outputs');
const { readInputSchema, DEFAULT_INPUT_SCHEMA_PATHS } = require('../lib/input_schema');

const INPUT_SCHEMA_EDITOR_BASE_URL = 'https://apify.github.io/input-schema-editor-react/';
const INPUT_SCHEMA_EDITOR_ORIGIN = new URL(INPUT_SCHEMA_EDITOR_BASE_URL).origin;

// Not really checked right now, but it might come useful if we ever need to do some breaking changes
const API_VERSION = 'v1';

class EditInputSchemaCommand extends ApifyCommand {
    async run() {
        const { args } = this.parse(EditInputSchemaCommand);
        let path = null;

        // This call fails if the input schema is invalid JSON
        const inputSchemaWithPath = await readInputSchema(args.path);

        if (!inputSchemaWithPath) {
            outputs.warning('Input schema has not been found. Default one will be created.');
            fs.writeFileSync(DEFAULT_INPUT_SCHEMA_PATHS[0], '{}');
            path = DEFAULT_INPUT_SCHEMA_PATHS[0];
        } else if (!inputSchemaWithPath.path) {
            // If path is not returned in inputSchemaWithPath, it means the input schema must be directly embedded as object in actor.json
            throw new Error('Cannot edit an input schema directly embedded in .actor/actor.json at this time. Please, submit a feature request!');
        } else {
            path = inputSchemaWithPath.path;
        }

        outputs.warning('This command is still experimental and might break at any time. Use at your own risk.\n');
        outputs.info(`Editing input schema at "${path}"...`);

        let server;
        const app = express();

        // To send requests from browser to localhost, CORS has to be configured properly
        app.use(cors({
            origin: INPUT_SCHEMA_EDITOR_ORIGIN,
            allowedHeaders: ['Content-Type', 'Authorization'],
        }));

        // Turn off keepalive, otherwise closing the server when command is finished is lagging
        app.use((req, res, next) => {
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

        apiRouter.get('/input-schema', (req, res) => {
            let inputSchemaStr;
            try {
                inputSchemaStr = fs.readFileSync(path, { encoding: 'utf-8', flag: 'a+' });
                if (inputSchemaStr.length > 2) {
                    jsonIndentation = detectIndent(inputSchemaStr).indent || jsonIndentation;
                }
                if (inputSchemaStr) {
                    appendFinalNewline = inputSchemaStr[inputSchemaStr.length - 1] === '\n';
                }
                outputs.info('Input schema loaded from disk.');
            } catch (err) {
                const errorMessage = `Reading input schema from disk failed with: ${err.message}`;
                outputs.error(errorMessage);
                res.status(500);
                res.send(errorMessage);
                return;
            }

            let inputSchemaObj;
            try {
                inputSchemaObj = JSON.parse(inputSchemaStr || '{}');
            } catch (err) {
                const errorMessage = `Parsing input schema failed with error: ${err.message}`;
                outputs.error(errorMessage);
                res.status(500);
                res.send(errorMessage);
                return;
            }

            res.send(inputSchemaObj);
            outputs.info('Input schema sent to editor.');
        });

        apiRouter.post('/input-schema', (req, res) => {
            try {
                outputs.info('Got input schema from editor...');
                const inputSchemaObj = req.body;
                let inputSchemaStr = JSON.stringify(inputSchemaObj, null, jsonIndentation);
                if (appendFinalNewline) inputSchemaStr += '\n';
                fs.writeFileSync(path, inputSchemaStr, { encoding: 'utf-8', flag: 'w+' });
                res.end();
                outputs.info('Input schema saved to disk.');
            } catch (err) {
                const errorMessage = `Saving input schema failed with error: ${err.message}`;
                outputs.error(errorMessage);
                res.status(500);
                res.send(errorMessage);
            }
        });

        apiRouter.post('/exit', (req, res) => {
            if (req.body.isWindowClosed) {
                outputs.info('Editor closed, finishing...');
            } else {
                outputs.info('Editing finished, you can close the editor.');
            }
            res.end();
            server.close(() => outputs.success('Done.'));
        });

        // Listening on port 0 will assign a random available port
        server = app.listen(0);
        const { port } = server.address();
        outputs.info(`Listening for messages from input schema editor on port ${port}...`);

        const editorUrl = `${INPUT_SCHEMA_EDITOR_BASE_URL}?localCliPort=${port}&localCliToken=${authToken}&localCliApiVersion=${API_VERSION}`;
        outputs.info(`Opening input schema editor at "${editorUrl}"...`);
        await open(editorUrl);
    }
}

EditInputSchemaCommand.description = 'Lets you edit your input schema that would be used on the platform in a visual input schema editor.';

EditInputSchemaCommand.args = [
    {
        name: 'path',
        required: false,
        description: 'Optional path to your INPUT_SCHEMA.json file. If not provided ./INPUT_SCHEMA.json is used.',
    },
];

EditInputSchemaCommand.hidden = true;

EditInputSchemaCommand.aliases = ['eis'];

module.exports = EditInputSchemaCommand;
