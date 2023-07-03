const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const { validateInputSchema } = require('@apify/input_schema');
const _ = require('underscore');
const { KEY_VALUE_STORE_KEYS } = require('@apify/consts');
const writeJsonFile = require('write-json-file');
const { ACTOR_SPECIFICATION_FOLDER } = require('./consts');
const { getLocalConfig, getJsonFileContent, getLocalKeyValueStorePath } = require('./utils');
const { warning } = require('./outputs');

const DEFAULT_INPUT_SCHEMA_PATHS = [
    '.actor/INPUT_SCHEMA.json',
    './INPUT_SCHEMA.json',
];

/**
 * Return the input schema from the default location.
 *
 * When the input schema does not exist, null is returned for schema.
 * In such a acase, path would be set to the location
 * where the input schema would be expected to be found (and e.g. can be created there).
 *
 * @param {string} forcePath
 * @returns {{inputSchema: object, inputSchemaPath: string | null}}
 */
const readInputSchema = async (forcePath) => {
    if (forcePath) {
        return {
            inputSchema: await getJsonFileContent(forcePath),
            inputSchemaPath: forcePath,
        };
    }

    const localConfig = getLocalConfig();

    if (typeof localConfig?.input === 'object') {
        return {
            inputSchema: localConfig.input,
            inputSchemaPath: null,
        };
    }

    if (typeof localConfig?.input === 'string') {
        const fullPath = path.join(ACTOR_SPECIFICATION_FOLDER, localConfig.input);
        return {
            inputSchema: await getJsonFileContent(fullPath),
            inputSchemaPath: fullPath,
        };
    }

    if (fs.existsSync(DEFAULT_INPUT_SCHEMA_PATHS[0])) {
        return {
            inputSchema: await getJsonFileContent(DEFAULT_INPUT_SCHEMA_PATHS[0]),
            inputSchemaPath: DEFAULT_INPUT_SCHEMA_PATHS[0],
        };
    }

    if (fs.existsSync(DEFAULT_INPUT_SCHEMA_PATHS[1])) {
        return {
            inputSchema: await getJsonFileContent(DEFAULT_INPUT_SCHEMA_PATHS[1]),
            inputSchemaPath: DEFAULT_INPUT_SCHEMA_PATHS[1],
        };
    }

    // If not input schema has been found so far, return the first default path
    // where the input schema would be expected.
    return {
        inputSchema: null,
        inputSchemaPath: DEFAULT_INPUT_SCHEMA_PATHS[0],
    };
};

/**
 * Goes to the Actor directory and creates INPUT.json file from the input schema prefills.
 * @param {string} actorFolderDir
 */
const createPrefilledInputFileFromInputSchema = async (actorFolderDir) => {
    const currentDir = process.cwd();
    let inputFile = {};
    try {
        process.chdir(actorFolderDir);
        const { inputSchema } = await readInputSchema();

        if (inputSchema) {
            /**
             * TODO: The logic is copied from @apify-packages/actor -> getPrefillFromInputSchema
             * It is not possible to install the package here because it is private
             * We should move it to @apify/input_schema and use it from there.
             */
            const validator = new Ajv({ strict: false });
            validateInputSchema(validator, inputSchema);

            inputFile = _.mapObject(inputSchema.properties, (fieldSchema) => ((fieldSchema.type === 'boolean' || fieldSchema.editor === 'hidden')
                ? fieldSchema.default
                : fieldSchema.prefill
            ));
        }
    } catch (err) {
        warning(`Could not create default input based on input schema, creating empty input instead. Cause: ${err.message}`);
    } finally {
        const keyValueStorePath = getLocalKeyValueStorePath();
        const inputJsonPath = path.join(actorFolderDir, keyValueStorePath, `${KEY_VALUE_STORE_KEYS.INPUT}.json`);
        await writeJsonFile(inputJsonPath, inputFile);
        process.chdir(currentDir);
    }
};

module.exports = {
    readInputSchema,
    createPrefilledInputFileFromInputSchema,
};
