const _ = require('underscore');
const { validateInputSchema } = require('@apify/input_schema');
const Ajv = require('ajv');
const { ApifyCommand } = require('../lib/apify_command');
const { readInputSchema } = require('../lib/input_schema');
const outputs = require('../lib/outputs');

class ValidateInputSchemaCommand extends ApifyCommand {
    async run() {
        const { args } = this.parse(ValidateInputSchemaCommand);

        const inputSchemaWithPath = await readInputSchema(args.path);

        if (!inputSchemaWithPath) {
            throw new Error('Input schema has not been found.');
        }

        const { schema: inputSchema } = inputSchemaWithPath;

        if (_.isEmpty(inputSchema)) {
            throw new Error('Input schema is empty.');
        }

        const validator = new Ajv({ strict: false });
        validateInputSchema(validator, inputSchema); // This one throws an error in a case of invalid schema.
        outputs.success('Input schema is valid.');
    }
}

ValidateInputSchemaCommand.description = `Validates input schema and prints errors found.
The input schema for the actor is used from these locations in order of preference.
The first one found is validated as it would be the one used on the Apify platform.
1. Directly embedded object in .actor/actor.json under 'input' key
2. Path to JSON file referenced in .actor/actor.json under 'input' key
3. JSON file at .actor/INPUT_SCHEMA.json
4. JSON file at INPUT_SCHEMA.json

You can also pass any custom path to your input schema to have it validated instead.
`;

ValidateInputSchemaCommand.args = [
    {
        name: 'path',
        required: false,
        description: 'Optional path to your INPUT_SCHEMA.json file. If not provided ./INPUT_SCHEMA.json is used.',
    },
];

module.exports = ValidateInputSchemaCommand;
