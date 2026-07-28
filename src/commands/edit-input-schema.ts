import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { dirname } from 'node:path';

import detectIndent from 'detect-indent';
import open from 'open';

import { cryptoRandomObjectId } from '@apify/utilities';

import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { LOCAL_CONFIG_PATH } from '../lib/consts.js';
import { readInputSchema } from '../lib/input_schema.js';
import { createLocalApiServer } from '../lib/local-api-server.js';
import { error, info, success, warning } from '../lib/outputs.js';

const INPUT_SCHEMA_EDITOR_BASE_URL = 'https://apify.github.io/input-schema-editor-react/';
const INPUT_SCHEMA_EDITOR_ORIGIN = new URL(INPUT_SCHEMA_EDITOR_BASE_URL).origin;

// Not really checked right now, but it might come useful if we ever need to do some breaking changes
const API_VERSION = 'v1';

export class EditInputSchemaCommand extends ApifyCommand<typeof EditInputSchemaCommand> {
	static override name = 'edit-input-schema' as const;

	static override description =
		'Lets you edit your input schema that would be used on the platform in a visual input schema editor.';

	static override group = 'Local Actor Development';

	static override interactive = true;

	static override interactiveNote =
		'Opens a browser-based schema editor. Requires a local display; cannot be run headlessly.';

	static override examples = [
		{
			description: 'Edit the input schema of the Actor in the current directory.',
			command: 'apify edit-input-schema',
		},
		{
			description: 'Edit a specific INPUT_SCHEMA.json file.',
			command: 'apify edit-input-schema ./.actor/INPUT_SCHEMA.json',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-edit-input-schema';

	static override args = {
		path: Args.string({
			required: false,
			description:
				'Optional path to your INPUT_SCHEMA.json file. If not provided default platform location for input schema is used.',
		}),
	};

	static override hidden = true;

	static override aliases = ['eis'];

	async run() {
		// This call fails if no input schema is found on any of the default locations
		const { inputSchema: existingSchema, inputSchemaPath } = await readInputSchema({
			forcePath: this.args.path,
			cwd: process.cwd(),
		});

		if (existingSchema && !inputSchemaPath) {
			// If path is not returned, it means the input schema must be directly embedded as object in actor.json
			// TODO - allow editing input schema embedded in actor.json
			throw new Error(`Editing an input schema directly embedded in '${LOCAL_CONFIG_PATH}' is not yet supported.`);
		}

		warning({ message: 'This command is still experimental and might break at any time. Use at your own risk.\n' });
		info({ message: `Editing input schema at "${inputSchemaPath}"...` });

		// Basic authorization via a random token, which is passed to the input schema editor,
		// and that sends it back via the `token` query param, or `Authorization` header
		const authToken = cryptoRandomObjectId();

		// We detect the format of the input schema JSON, so that updating it does not cause too many changes
		let jsonIndentation = '    ';
		let appendFinalNewline = true;

		// Deliberately a minimal node:http server instead of express + cors — they added
		// ~2.6 MB and 59 packages to the CLI's install size for a few tiny endpoints.
		const server = createLocalApiServer({
			corsOrigin: INPUT_SCHEMA_EDITOR_ORIGIN,
			authToken,
			routes: {
				[`GET /api/${API_VERSION}/input-schema`]: (_, res) => {
					let inputSchemaStr;
					try {
						inputSchemaStr = existsSync(inputSchemaPath)
							? readFileSync(inputSchemaPath, { encoding: 'utf-8' })
							: '{}\n';
						if (inputSchemaStr.length > 3) {
							jsonIndentation = detectIndent(inputSchemaStr).indent || jsonIndentation;
						}
						if (inputSchemaStr) {
							appendFinalNewline = inputSchemaStr[inputSchemaStr.length - 1] === '\n';
						}
						if (existsSync(inputSchemaPath)) {
							info({ message: `Input schema loaded from "${inputSchemaPath}"` });
						} else {
							info({ message: `Empty input schema initialized.` });
						}
					} catch (err) {
						const errorMessage = `Reading input schema from disk failed with: ${(err as Error).message}`;
						error({ message: errorMessage });
						res.status(500);
						res.send(errorMessage);
						return;
					}

					let inputSchemaObj;
					try {
						inputSchemaObj = JSON.parse(inputSchemaStr || '{}');
					} catch (err) {
						const errorMessage = `Parsing input schema failed with error: ${(err as Error).message}`;
						error({ message: errorMessage });
						res.status(500);
						res.send(errorMessage);
						return;
					}

					res.send(inputSchemaObj);
					info({ message: 'Input schema sent to editor.' });
				},
				[`POST /api/${API_VERSION}/input-schema`]: (body, res) => {
					try {
						info({ message: 'Got input schema from editor...' });
						let inputSchemaStr = JSON.stringify(body, null, jsonIndentation);
						if (appendFinalNewline) inputSchemaStr += '\n';

						const inputSchemaDir = dirname(inputSchemaPath);
						if (!existsSync(inputSchemaDir)) {
							mkdirSync(inputSchemaDir, { recursive: true });
						}

						writeFileSync(inputSchemaPath, inputSchemaStr, { encoding: 'utf-8', flag: 'w+' });
						res.end();
						info({ message: 'Input schema saved to disk.' });
					} catch (err) {
						const errorMessage = `Saving input schema failed with error: ${(err as Error).message}`;
						error({ message: errorMessage });
						res.status(500);
						res.send(errorMessage);
					}
				},
				[`POST /api/${API_VERSION}/exit`]: (body, res) => {
					if (body.isWindowClosed) {
						info({ message: 'Editor closed, finishing...' });
					} else {
						info({ message: 'Editing finished, you can close the editor.' });
					}
					res.end();
					server.close(() => success({ message: 'Done.' }));
				},
			},
		});

		// Listening on port 0 will assign a random available port
		server.listen(0);
		const { port } = server.address() as AddressInfo;
		info({ message: `Listening for messages from input schema editor on port ${port}...` });

		const editorUrl = `${INPUT_SCHEMA_EDITOR_BASE_URL}?localCliPort=${port}&localCliToken=${authToken}&localCliApiVersion=${API_VERSION}`;
		info({ message: `Opening input schema editor at "${editorUrl}"...` });
		await open(editorUrl);
	}
}
