const jsonSchemaOfInputSchema = require('apify-shared/input_schema');
const Ajv = require('ajv');
const fs = require('fs');
const { ApifyCommand } = require('../lib/apify_command');
const outputs = require('../lib/outputs');

const DEFAULT_INPUT_SCHEMA_PATH = './INPUT_SCHEMA.json';

class ValidateInputSchemaCommand extends ApifyCommand {
    async run() {
        const { args } = this.parse(ValidateInputSchemaCommand);
        const { path = DEFAULT_INPUT_SCHEMA_PATH } = args;

        let inputSchemaValidator;

        try {
            const ajv = new Ajv();
            inputSchemaValidator = ajv.compile(jsonSchemaOfInputSchema);
        } catch (err) {
            outputs.error(`Cannot parse JSON schema of actor input schema (${err.message})`);
            process.exit(1);
        }

        let inputSchemaObj;

        try {
            const inputSchemaStr = fs.readFileSync(path).toString();
            inputSchemaObj = JSON.parse(inputSchemaStr);
        } catch (err) {
            outputs.error(`Input schema is not a valid JSON (${err})`);
            process.exit(1);
        }

        if (!inputSchemaValidator(inputSchemaObj)) {
            const errors = JSON.stringify(inputSchemaValidator.errors, null, 2);
            outputs.error(`Input schema is not valid (${errors})`);
            process.exit(1);
        }

        outputs.success('Input schema is valid.');
    }
}

ValidateInputSchemaCommand.description = 'Validates INPUT_SCHEMA.json file and prints possible errors.';

ValidateInputSchemaCommand.args = [
    {
        name: 'path',
        required: false,
        description: 'Optional path to your INPUT_SCHEMA.json file. If not provided ./INPUT_SCHEMA.json is used.',
    },
];

module.exports = ValidateInputSchemaCommand;
