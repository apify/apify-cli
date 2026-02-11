import process from 'node:process';

import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { LOCAL_CONFIG_PATH } from '../lib/consts.js';
import { readAndValidateInputSchema } from '../lib/input_schema.js';
import { success } from '../lib/outputs.js';

export class ValidateInputSchemaCommand extends ApifyCommand<typeof ValidateInputSchemaCommand> {
	static override name = 'validate-schema' as const;

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
		await readAndValidateInputSchema({
			forcePath: this.args.path,
			cwd: process.cwd(),
			action: 'Validating',
		});

		success({ message: 'Input schema is valid.' });
	}
}
