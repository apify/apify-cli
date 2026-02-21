import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import deepClone from 'lodash.clonedeep';

import { KEY_VALUE_STORE_KEYS } from '@apify/consts';
import { validateInputSchema } from '@apify/input_schema';

import { ACTOR_SPECIFICATION_FOLDER, LOCAL_CONFIG_PATH } from './consts.js';
import { info, warning } from './outputs.js';
import { Ajv2019, getJsonFileContent, getLocalConfig, getLocalKeyValueStorePath } from './utils.js';

const DEFAULT_INPUT_SCHEMA_PATHS = [
	'.actor/INPUT_SCHEMA.json',
	'./INPUT_SCHEMA.json',
	'.actor/input_schema.json',
	'./input_schema.json',
];

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

	for (const path of DEFAULT_INPUT_SCHEMA_PATHS) {
		const fullPath = join(cwd, path);
		if (existsSync(fullPath)) {
			return {
				inputSchema: getJsonFileContent(fullPath),
				inputSchemaPath: fullPath,
			};
		}
	}

	// If not input schema has been found so far, return the first default path
	// where the input schema would be expected.
	return {
		inputSchema: null,
		inputSchemaPath: join(cwd, DEFAULT_INPUT_SCHEMA_PATHS[0]),
	};
};

/**
 * Reads and validates input schema, logging appropriate info messages.
 * Throws an error if the schema is not found or invalid.
 *
 * @param options.forcePath - Optional path to force reading from
 * @param options.cwd - Current working directory
 * @param options.action - Action description for the info message (e.g., "Validating", "Generating types from")
 * @returns The validated input schema and its path
 */
export const readAndValidateInputSchema = async ({
	forcePath,
	cwd,
	action,
}: {
	forcePath?: string;
	cwd: string;
	action: string;
}): Promise<{ inputSchema: Record<string, unknown>; inputSchemaPath: string | null }> => {
	const { inputSchema, inputSchemaPath } = await readInputSchema({
		forcePath,
		cwd,
	});

	if (!inputSchema) {
		throw new Error(`Input schema has not been found at ${inputSchemaPath}.`);
	}

	if (inputSchemaPath) {
		info({ message: `${action} input schema at ${inputSchemaPath}` });
	} else {
		info({ message: `${action} input schema embedded in '${LOCAL_CONFIG_PATH}'` });
	}

	const validator = new Ajv2019({ strict: false });
	validateInputSchema(validator, inputSchema);

	return { inputSchema, inputSchemaPath };
};

/**
 * Read a storage schema (Dataset or Key-Value Store) from the Actor config.
 *
 * Resolves `storages.<key>` from `.actor/actor.json`:
 * - If it's an object, uses it directly as the embedded schema.
 * - If it's a string, resolves the file path relative to `.actor/`.
 * - If it's missing, returns `null`.
 */
export const readStorageSchema = ({
	cwd,
	key,
	label,
}: {
	cwd: string;
	key: string;
	label: string;
}): { schema: Record<string, unknown>; schemaPath: string | null } | null => {
	const localConfig = getLocalConfig(cwd);

	const ref = (localConfig?.storages as Record<string, unknown> | undefined)?.[key];

	if (typeof ref === 'object' && ref !== null) {
		return {
			schema: ref as Record<string, unknown>,
			schemaPath: null,
		};
	}

	if (typeof ref === 'string') {
		const fullPath = join(cwd, ACTOR_SPECIFICATION_FOLDER, ref);
		const schema = getJsonFileContent(fullPath);

		if (!schema) {
			warning({
				message: `${label} schema file not found at ${fullPath} (referenced in '${LOCAL_CONFIG_PATH}').`,
			});
			return null;
		}

		return {
			schema,
			schemaPath: fullPath,
		};
	}

	return null;
};

/**
 * Read the Dataset schema from the Actor config.
 * Thin wrapper around `readStorageSchema` for backwards compatibility.
 */
export const readDatasetSchema = (
	{ cwd }: { cwd: string } = { cwd: process.cwd() },
): { datasetSchema: Record<string, unknown>; datasetSchemaPath: string | null } | null => {
	const result = readStorageSchema({ cwd, key: 'dataset', label: 'Dataset' });

	if (!result) {
		return null;
	}

	return {
		datasetSchema: result.schema,
		datasetSchemaPath: result.schemaPath,
	};
};

/**
 * Read the Output schema from the Actor config.
 *
 * Resolves `output` from `.actor/actor.json`:
 * - If it's an object, uses it directly as the embedded schema.
 * - If it's a string, resolves the file path relative to `.actor/`.
 * - If it's missing, returns `null`.
 */
export const readOutputSchema = (
	{ cwd }: { cwd: string } = { cwd: process.cwd() },
): { outputSchema: Record<string, unknown>; outputSchemaPath: string | null } | null => {
	const localConfig = getLocalConfig(cwd);

	const outputRef = localConfig?.output;

	if (typeof outputRef === 'object' && outputRef !== null) {
		return {
			outputSchema: outputRef as Record<string, unknown>,
			outputSchemaPath: null,
		};
	}

	if (typeof outputRef === 'string') {
		const fullPath = join(cwd, ACTOR_SPECIFICATION_FOLDER, outputRef);
		const schema = getJsonFileContent(fullPath);

		if (!schema) {
			warning({
				message: `Output schema file not found at ${fullPath} (referenced in '${LOCAL_CONFIG_PATH}').`,
			});
			return null;
		}

		return {
			outputSchema: schema,
			outputSchemaPath: fullPath,
		};
	}

	return null;
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
			const validator = new Ajv2019({ strict: false });
			validateInputSchema(validator, inputSchema);

			// inputFile = _.mapObject(inputSchema.properties as any, (fieldSchema) =>
			// 	fieldSchema.type === 'boolean' || fieldSchema.editor === 'hidden'
			// 		? fieldSchema.default
			// 		: fieldSchema.prefill,
			// );
			inputFile = Object.entries(inputSchema.properties as any).reduce(
				(acc, [key, fieldSchema]: [string, any]) => {
					acc[key] =
						fieldSchema.type === 'boolean' || fieldSchema.editor === 'hidden'
							? fieldSchema.default
							: fieldSchema.prefill;

					return acc;
				},
				{} as Record<string, any>,
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
		writeFileSync(inputJsonPath, JSON.stringify(inputFile, null, '\t'));
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
