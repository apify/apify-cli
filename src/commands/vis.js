const { validateInputSchema } = require('@apify/input_schema');
const Ajv = require('ajv');
const fs = require('fs');
const { ApifyCommand } = require('../lib/apify_command');
const outputs = require('../lib/outputs');

const DEFAULT_INPUT_SCHEMA_PATH = './INPUT_SCHEMA.json';

class ValidateInputSchemaCommand extends ApifyCommand {
    async run() {
        const { args } = this.parse(ValidateInputSchemaCommand);
        const { path = DEFAULT_INPUT_SCHEMA_PATH } = args;
        const validator = new Ajv({ cache: false });

        let inputSchemaObj;

        try {
            const inputSchemaStr = fs.readFileSync(path).toString();
            inputSchemaObj = JSON.parse(inputSchemaStr);
        } catch (err) {
            throw new Error(`Input schema is not a valid JSON (${err})`);
        }

        validateInputSchema(validator, inputSchemaObj); // This one throws an error in a case of invalid schema.
        outputs.success('Input schema is valid.');
    }
}

ValidateInputSchemaCommand.description = 'Validates INPUT_SCHEMA.json file and prints errors found.';

ValidateInputSchemaCommand.args = [
    {
        name: 'path',
        required: false,
        description: 'Optional path to your INPUT_SCHEMA.json file. If not provided ./INPUT_SCHEMA.json is used.',
    },
];

module.exports = ValidateInputSchemaCommand;
