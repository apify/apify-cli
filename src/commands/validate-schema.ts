import process from 'node:process';

import { validateInputSchema } from '@apify/input_schema';
import { Args } from '@oclif/core';

import { ApifyCommand } from '../lib/apify_command.js';
import { LOCAL_CONFIG_PATH } from '../lib/consts.js';
import { readInputSchema } from '../lib/input_schema.js';
import { info, success } from '../lib/outputs.js';
import { Ajv } from '../lib/utils.js';

export class ValidateInputSchemaCommand extends ApifyCommand<typeof ValidateInputSchemaCommand> {
    static override description = `Validates input schema and prints errors found.
The input schema for the Actor is used from these locations in order of preference.
The first one found is validated as it would be the one used on the Apify platform.
1. Directly embedded object in "${LOCAL_CONFIG_PATH}" under 'input' key
2. Path to JSON file referenced in "${LOCAL_CONFIG_PATH}" under 'input' key
3. JSON file at .actor/INPUT_SCHEMA.json
4. JSON file at INPUT_SCHEMA.json

You can also pass any custom path to your input schema to have it validated instead.
`;

    static override args = {
        path: Args.string({
            required: false,
            description: 'Optional path to your INPUT_SCHEMA.json file. If not provided ./INPUT_SCHEMA.json is used.',
        }),
    };

    static override hiddenAliases = ['vis'];

    async run() {
        const { inputSchema, inputSchemaPath } = await readInputSchema({ forcePath: this.args.path, cwd: process.cwd() });

        if (!inputSchema) {
            throw new Error(`Input schema has not been found at ${inputSchemaPath}.`);
        }

        if (inputSchemaPath) {
            info({ message: `Validating input schema stored at ${inputSchemaPath}` });
        } else {
            info({ message: `Validating input schema embedded in "${LOCAL_CONFIG_PATH}"` });
        }

        const validator = new Ajv({ strict: false });
        validateInputSchema(validator, inputSchema); // This one throws an error in a case of invalid schema.
        success({ message: 'Input schema is valid.' });
    }
}
