/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { KEY_VALUE_STORE_KEYS } from '@apify/consts';
import { validateInputSchema } from '@apify/input_schema';
import deepClone from 'lodash.clonedeep';
import _ from 'underscore';
import { writeJsonFile } from 'write-json-file';

import { ACTOR_SPECIFICATION_FOLDER } from './consts.js';
import { warning } from './outputs.js';
import { Ajv, getJsonFileContent, getLocalConfig, getLocalKeyValueStorePath } from './utils.js';

const DEFAULT_INPUT_SCHEMA_PATHS = ['.actor/INPUT_SCHEMA.json', './INPUT_SCHEMA.json'];

/**
 * Return the input schema from the default location.
 *
 * When the input schema does not exist, null is returned for schema.
 * In such a case, path would be set to the location
 * where the input schema would be expected to be found (and e.g. can be created there).
 */
export const readInputSchema = async (
	{ forcePath, cwd }: { forcePath?: string; cwd: string } = { cwd: process.cwd() },
) => {
	if (forcePath) {
		return {
			inputSchema: getJsonFileContent(forcePath),
			inputSchemaPath: forcePath,
		};
	}

	const localConfig = getLocalConfig(cwd);

	if (typeof localConfig?.input === 'object') {
		return {
			inputSchema: localConfig.input as Record<string, unknown>,
			inputSchemaPath: null,
		};
	}

	if (typeof localConfig?.input === 'string') {
		const fullPath = join(cwd, ACTOR_SPECIFICATION_FOLDER, localConfig.input);
		return {
			inputSchema: getJsonFileContent(fullPath),
			inputSchemaPath: fullPath,
		};
	}

	if (existsSync(join(cwd, DEFAULT_INPUT_SCHEMA_PATHS[0]))) {
		return {
			inputSchema: getJsonFileContent(join(cwd, DEFAULT_INPUT_SCHEMA_PATHS[0])),
			inputSchemaPath: join(cwd, DEFAULT_INPUT_SCHEMA_PATHS[0]),
		};
	}

	if (existsSync(join(cwd, DEFAULT_INPUT_SCHEMA_PATHS[1]))) {
		return {
			inputSchema: getJsonFileContent(join(cwd, DEFAULT_INPUT_SCHEMA_PATHS[1])),
			inputSchemaPath: join(cwd, DEFAULT_INPUT_SCHEMA_PATHS[1]),
		};
	}

	// If not input schema has been found so far, return the first default path
	// where the input schema would be expected.
	return {
		inputSchema: null,
		inputSchemaPath: join(cwd, DEFAULT_INPUT_SCHEMA_PATHS[0]),
	};
};

/**
 * Goes to the Actor directory and creates INPUT.json file from the input schema prefills.

 */
export const createPrefilledInputFileFromInputSchema = async (actorFolderDir: string) => {
	let inputFile = {};
	try {
		const { inputSchema } = await readInputSchema({ cwd: actorFolderDir });

		if (inputSchema) {
			/**
			 * TODO: The logic is copied from @apify-packages/actor -> getPrefillFromInputSchema
			 * It is not possible to install the package here because it is private
			 * We should move it to @apify/input_schema and use it from there.
			 */
			const validator = new Ajv({ strict: false });
			validateInputSchema(validator, inputSchema);

			inputFile = _.mapObject(inputSchema.properties as any, (fieldSchema) =>
				fieldSchema.type === 'boolean' || fieldSchema.editor === 'hidden'
					? fieldSchema.default
					: fieldSchema.prefill,
			);
		}
	} catch (err) {
		warning({
			message: `Could not create default input based on input schema, creating empty input instead. Cause: ${
				(err as Error).message
			}`,
		});
	} finally {
		const keyValueStorePath = getLocalKeyValueStorePath();
		const inputJsonPath = join(actorFolderDir, keyValueStorePath, `${KEY_VALUE_STORE_KEYS.INPUT}.json`);
		await writeJsonFile(inputJsonPath, inputFile);
	}
};

export const getDefaultsFromInputSchema = (inputSchema: any) => {
	const defaults: Record<string, unknown> = {};

	for (const [key, fieldSchema] of Object.entries<any>(inputSchema.properties)) {
		if (fieldSchema.default !== undefined) {
			defaults[key] = fieldSchema.default;
		}
	}

	return defaults;
};

// Lots of code copied from @apify-packages/actor, this really should be moved to the shared input_schema package
export const getAjvValidator = (inputSchema: any, ajvInstance: import('ajv').Ajv) => {
	const copyOfSchema = deepClone(inputSchema);
	copyOfSchema.required = [];

	for (const [inputSchemaFieldKey, inputSchemaField] of Object.entries<any>(inputSchema.properties)) {
		// `required` field doesn't need to be present in input schema
		const isRequired = inputSchema.required?.includes(inputSchemaFieldKey);
		const hasDefault = inputSchemaField.default !== undefined;

		if (isRequired && !hasDefault) {
			// If field is required but has default, we act like it's optional because we always have value to use
			copyOfSchema.required.push(inputSchemaFieldKey);
			if (inputSchemaField.type === 'array') {
				// If array is required, it has to have at least 1 item.
				inputSchemaField.minItems = Math.max(1, inputSchemaField.minItems || 0);
			}
		}
	}

	delete copyOfSchema.$schema;

	return ajvInstance.compile(copyOfSchema);
};
