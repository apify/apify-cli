const fs = require('fs');
const path = require('path');
const { ACTOR_SPECIFICATION_FOLDER } = require('./consts');
const { getLocalConfig, getJsonFileContent } = require('./utils');

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

module.exports = {
    readInputSchema,
};
