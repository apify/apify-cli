import process from 'node:process';

import { validateInputSchema } from '@apify/input_schema';
import { Args } from '@oclif/core';

import { ApifyCommand } from '../lib/apify_command.js';
import { LOCAL_CONFIG_PATH } from '../lib/consts.js';
import { readInputSchema } from '../lib/input_schema.js';
import { info, success } from '../lib/outputs.js';
import { Ajv } from '../lib/utils.js';

export class ValidateInputSchemaCommand extends ApifyCommand<typeof ValidateInputSchemaCommand> {
	static override description = `Validates Actor input schema from one of these locations (in priority order):
		1. Object in '${LOCAL_CONFIG_PATH}' under "input" key
		2. JSON file path in '${LOCAL_CONFIG_PATH}' "input" key
		3. .actor/INPUT_SCHEMA.json
		4. INPUT_SCHEMA.json

		Optionally specify custom schema path to validate.`;

	static override args = {
		path: Args.string({
			required: false,
			description: 'Optional path to your INPUT_SCHEMA.json file. If not provided ./INPUT_SCHEMA.json is used.',
		}),
	};

	static override hiddenAliases = ['vis'];

	async run() {
		const { inputSchema, inputSchemaPath } = await readInputSchema({
			forcePath: this.args.path,
			cwd: process.cwd(),
		});

		if (!inputSchema) {
			throw new Error(`Input schema has not been found at ${inputSchemaPath}.`);
		}

		if (inputSchemaPath) {
			info({ message: `Validating input schema stored at ${inputSchemaPath}` });
		} else {
			info({ message: `Validating input schema embedded in '${LOCAL_CONFIG_PATH}'` });
		}

		const validator = new Ajv({ strict: false });
		validateInputSchema(validator, inputSchema); // This one throws an error in a case of invalid schema.
		success({ message: 'Input schema is valid.' });
	}
}
