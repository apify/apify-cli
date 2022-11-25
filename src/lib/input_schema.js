const fs = require('fs');
const path = require('path');
const { ACTOR_SPECIFICATION_FOLDER } = require('./consts');
const outputs = require('./outputs');
const { getLocalConfig } = require('./utils');

const DEFAULT_INPUT_SCHEMA_PATHS = [
    '.actor/INPUT_SCHEMA.json',
    './INPUT_SCHEMA.json',
];

const readInputSchemaOnPath = async (inputSchemaPath) => {
    outputs.info(`Reading input schema stored at ${inputSchemaPath}`);
    if (!fs.existsSync(inputSchemaPath)) {
        throw new Error(`Input schema has not been found at ${inputSchemaPath}.`);
    }
    try {
        const inputSchema = JSON.parse(fs.readFileSync(inputSchemaPath).toString());
        return inputSchema;
    } catch (err) {
        throw new Error(`Input schema is not a valid JSON (${err})`);
    }
};

/**
 * Reads and returns the input schema from the default location. If no input schema is found, the function throws.
 * If the returned path is "null", the input schema is directly embedded in actor.json.
 *
 * @param {string} forcePath
 * @returns {{schema: object, path: string | null}}
 */
const readInputSchema = async (forcePath) => {
    if (forcePath) {
        return {
            schema: await readInputSchemaOnPath(forcePath),
            path,
        };
    }

    const localConfig = getLocalConfig();

    if (typeof localConfig?.input === 'object') {
        outputs.info('Note: Input schema is directly embedded in .actor/actor.json');
        return {
            schema: localConfig.input,
            path: null,
        };
    }

    if (typeof localConfig?.input === 'string') {
        outputs.info('Note: Input schema is explicitly referenced in .actor/actor.json');
        const fullPath = path.join(ACTOR_SPECIFICATION_FOLDER, localConfig.input);
        return {
            schema: await readInputSchemaOnPath(fullPath),
            path: fullPath,
        };
    }

    if (fs.existsSync(DEFAULT_INPUT_SCHEMA_PATHS[0])) {
        return {
            schema: await readInputSchemaOnPath(DEFAULT_INPUT_SCHEMA_PATHS[0]),
            path: DEFAULT_INPUT_SCHEMA_PATHS[0],
        };
    }

    if (fs.existsSync(DEFAULT_INPUT_SCHEMA_PATHS[1])) {
        return {
            schema: await readInputSchemaOnPath(DEFAULT_INPUT_SCHEMA_PATHS[1]),
            path: DEFAULT_INPUT_SCHEMA_PATHS[1],
        };
    }

    throw new Error('Input schema has not been found.');
};

module.exports = {
    readInputSchema,
};
