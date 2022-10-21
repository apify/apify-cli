const fs = require('fs');

const detectIndent = require('detect-indent');
const express = require('express');
const open = require('open');

const { ApifyCommand } = require('../lib/apify_command');
const outputs = require('../lib/outputs');

const DEFAULT_INPUT_SCHEMA_PATH = './INPUT_SCHEMA.json';
const INPUT_SCHEMA_EDITOR_BASE_URL = `https://apify.github.io/input-schema-editor-react/`;
const INPUT_SCHEMA_EDITOR_ORIGIN = new URL(INPUT_SCHEMA_EDITOR_BASE_URL).origin;

class EditInputSchemaCommand extends ApifyCommand {
    async run() {
        const { args } = this.parse(EditInputSchemaCommand);
        const { path = DEFAULT_INPUT_SCHEMA_PATH } = args;

        outputs.warning('This command is still experimental and might break at any time. Use at your own risk.\n');
        outputs.info(`Editing input schema at "${path}"...`);

        let server;
        let jsonIndentation = '    ';
        let appendFinalNewline = true;

        const app = express();
        app.use(express.json());
        app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', INPUT_SCHEMA_EDITOR_ORIGIN);
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            res.set('Connection', 'close');
            next();
        });

        app.get('/api/input-schema', (req, res) => {
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

        app.post('/api/input-schema', (req, res) => {
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

        app.post('/api/exit', (req, res) => {
            if (req.body.isWindowClosed) {
                outputs.info('Editor closed, finishing...');
            } else {
                outputs.info('Editing finished, you can close the editor.');
            }
            res.end();
            server.close(() => outputs.success('Done.'));
        });

        server = app.listen(0);
        const { port } = server.address();
        outputs.info(`Listening for messages from input schema editor on port ${port}...`);

        const editorUrl = `${INPUT_SCHEMA_EDITOR_BASE_URL}?localCliPort=${port}`;
        outputs.info(`Opening input schema editor at "${editorUrl}"...`);
        await open(editorUrl);
    }
}

EditInputSchemaCommand.description = 'Lets you edit your input schema in a visual input schema editor.';

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
