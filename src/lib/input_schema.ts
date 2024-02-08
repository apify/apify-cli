import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { KEY_VALUE_STORE_KEYS } from '@apify/consts';
import { validateInputSchema } from '@apify/input_schema';
import _ from 'underscore';
import { writeJsonFile } from 'write-json-file';

import { ACTOR_SPECIFICATION_FOLDER } from './consts.js';
import { warning } from './outputs.js';
import { Ajv, getJsonFileContent, getLocalConfig, getLocalKeyValueStorePath } from './utils.js';

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
 */
export const readInputSchema = async (forcePath?: string) => {
    if (forcePath) {
        return {
            inputSchema: getJsonFileContent(forcePath),
            inputSchemaPath: forcePath,
        };
    }

    const localConfig = getLocalConfig();

    if (typeof localConfig?.input === 'object') {
        return {
            inputSchema: localConfig.input as Record<string, unknown>,
            inputSchemaPath: null,
        };
    }

    if (typeof localConfig?.input === 'string') {
        const fullPath = join(ACTOR_SPECIFICATION_FOLDER, localConfig.input);
        return {
            inputSchema: getJsonFileContent(fullPath),
            inputSchemaPath: fullPath,
        };
    }

    if (existsSync(DEFAULT_INPUT_SCHEMA_PATHS[0])) {
        return {
            inputSchema: getJsonFileContent(DEFAULT_INPUT_SCHEMA_PATHS[0]),
            inputSchemaPath: DEFAULT_INPUT_SCHEMA_PATHS[0],
        };
    }

    if (existsSync(DEFAULT_INPUT_SCHEMA_PATHS[1])) {
        return {
            inputSchema: getJsonFileContent(DEFAULT_INPUT_SCHEMA_PATHS[1]),
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

 */
export const createPrefilledInputFileFromInputSchema = async (actorFolderDir: string) => {
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

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            inputFile = _.mapObject(inputSchema.properties as any, (fieldSchema) => ((fieldSchema.type === 'boolean' || fieldSchema.editor === 'hidden')
                ? fieldSchema.default
                : fieldSchema.prefill
            ));
        }
    } catch (err) {
        warning(`Could not create default input based on input schema, creating empty input instead. Cause: ${(err as Error).message}`);
    } finally {
        const keyValueStorePath = getLocalKeyValueStorePath();
        const inputJsonPath = join(actorFolderDir, keyValueStorePath, `${KEY_VALUE_STORE_KEYS.INPUT}.json`);
        await writeJsonFile(inputJsonPath, inputFile);
        process.chdir(currentDir);
    }
};
