const { validateInputSchema } = require('@apify/input_schema');
const Ajv = require('ajv');
const fs = require('fs');
const path = require('path');
const { ApifyCommand } = require('../lib/apify_command');
const { ACTOR_SPECIFICATION_FOLDER } = require('../lib/consts');
const outputs = require('../lib/outputs');
const { getLocalConfig } = require('../lib/utils');

const DEFAULT_INPUT_SCHEMA_PATHS = [
    '.actor/INPUT_SCHEMA.json',
    './INPUT_SCHEMA.json',
];

class ValidateInputSchemaCommand extends ApifyCommand {
    validateInputSchemaObject(inputSchema) {
        const validator = new Ajv({ strict: false });
        validateInputSchema(validator, inputSchema); // This one throws an error in a case of invalid schema.
        outputs.success('Input schema is valid.');
    }

    readAndValidateInputSchemaOnPath(inputSchemaPath) {
        outputs.info(`Validating input schema stored at ${inputSchemaPath}`);
        if (!fs.existsSync(inputSchemaPath)) {
            throw new Error(`Input schema has not been found at ${inputSchemaPath}.`);
        }
        try {
            const inputSchema = JSON.parse(fs.readFileSync(inputSchemaPath).toString());
            this.validateInputSchemaObject(inputSchema);
        } catch (err) {
            throw new Error(`Input schema is not a valid JSON (${err})`);
        }
    }

    async run() {
        const { args } = this.parse(ValidateInputSchemaCommand);

        if (args.path) {
            this.readAndValidateInputSchemaOnPath(args.path);
            return;
        }

        const localConfig = getLocalConfig();

        if (typeof localConfig?.input === 'object') {
            outputs.info('Validating input schema directly embedded in .actor/actor.json');
            this.validateInputSchemaObject(localConfig.input);
            return;
        }

        if (typeof localConfig?.input === 'string') {
            outputs.info(`Found path to input schema (${localConfig?.input}) in .actor/actor.json`);
            this.readAndValidateInputSchemaOnPath(path.join(ACTOR_SPECIFICATION_FOLDER, localConfig.input));
            return;
        }

        if (fs.existsSync(DEFAULT_INPUT_SCHEMA_PATHS[0])) {
            this.readAndValidateInputSchemaOnPath(DEFAULT_INPUT_SCHEMA_PATHS[0]);
            return;
        }

        if (fs.existsSync(DEFAULT_INPUT_SCHEMA_PATHS[1])) {
            this.readAndValidateInputSchemaOnPath(DEFAULT_INPUT_SCHEMA_PATHS[1]);
            return;
        }

        throw new Error('No input schema found.');
    }
}

ValidateInputSchemaCommand.description = `Input schema for actor is used from these locations in order of preference.
The first one found is validated as it would be the one used on the Apify platform.
1. Directly embedded object in .actor/actor.json under 'input' key
2. Path to JSON file referenced in .actor/actor.json under 'input' key
3. JSON file at .actor/INPUT_SCHEMA.json
4. JSON file at INPUT_SCHEMA.json

You can also pass a any custom path to your input schema to have it validated instead.
`;

ValidateInputSchemaCommand.args = [
    {
        name: 'path',
        required: false,
        description: 'Optional path to your INPUT_SCHEMA.json file. If not provided ./INPUT_SCHEMA.json is used.',
    },
];

module.exports = ValidateInputSchemaCommand;
