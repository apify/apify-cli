import process from 'node:process';

import { validateInputSchema } from '@apify/input_schema';

import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { CommandExitCodes, LOCAL_CONFIG_PATH } from '../lib/consts.js';
import {
	readAndValidateInputSchema,
	readInputSchema,
	readStorageSchema,
	validateDatasetSchema,
	validateKvsSchema,
	validateOutputSchema,
} from '../lib/input_schema.js';
import { error, info, success } from '../lib/outputs.js';
import { Ajv2019 } from '../lib/utils.js';

export class ValidateSchemaCommand extends ApifyCommand<typeof ValidateSchemaCommand> {
	static override name = 'validate-schema' as const;

	static override description = `Validates Actor schemas.

When a path argument is provided, validates only the input schema at that path.

When no path is provided, validates all schemas found in '${LOCAL_CONFIG_PATH}':
  - Input schema (from "input" key or default locations)
  - Dataset schema (from "storages.dataset")
  - Output schema (from "output")
  - Key-Value Store schema (from "storages.keyValueStore")`;

	static override args = {
		path: Args.string({
			required: false,
			description: 'Optional path to your INPUT_SCHEMA.json file. If not provided, validates all schemas in actor.json.',
		}),
	};

	static override hiddenAliases = ['vis'];

	async run() {
		if (this.args.path) {
			await this.validateInputSchemaAtPath(this.args.path);
			return;
		}

		await this.validateAllSchemas();
	}

	private async validateInputSchemaAtPath(forcePath: string) {
		await readAndValidateInputSchema({
			forcePath,
			cwd: process.cwd(),
			getMessage: (path) => `Validating input schema at ${path ?? forcePath}`,
		});

		success({ message: 'Input schema is valid.' });
	}

	private async validateAllSchemas() {
		const cwd = process.cwd();
		let foundAny = false;
		let hasErrors = false;

		// Input schema — not using readAndValidateInputSchema here because it throws
		// when no schema is found; in the all-schemas scan, a missing input schema
		// should be silently skipped, not treated as an error.
		try {
			const { inputSchema, inputSchemaPath } = await readInputSchema({ cwd, throwOnMissing: true });

			if (inputSchema) {
				foundAny = true;

				const location = inputSchemaPath
					? `at ${inputSchemaPath}`
					: `embedded in '${LOCAL_CONFIG_PATH}'`;
				info({ message: `Validating input schema ${location}` });

				const validator = new Ajv2019({ strict: false });
				validateInputSchema(validator, inputSchema);
				success({ message: 'Input schema is valid.' });
			}
		} catch (err) {
			foundAny = true;
			hasErrors = true;
			error({ message: (err as Error).message });
		}

		// Storage schemas (Dataset, Output, Key-Value Store)
		const storageSchemas = [
			{ label: 'Dataset', read: () => readStorageSchema({ cwd, key: 'dataset', label: 'Dataset', throwOnMissing: true }), validate: validateDatasetSchema },
			{ label: 'Output', read: () => readStorageSchema({ cwd, key: 'output', label: 'Output', getRef: (config) => config?.output, throwOnMissing: true }), validate: validateOutputSchema },
			{ label: 'Key-Value Store', read: () => readStorageSchema({ cwd, key: 'keyValueStore', label: 'Key-Value Store', throwOnMissing: true }), validate: validateKvsSchema },
		];

		for (const { label, read, validate } of storageSchemas) {
			try {
				const result = read();

				if (result) {
					foundAny = true;

					const location = result.schemaPath
						? `at ${result.schemaPath}`
						: `embedded in '${LOCAL_CONFIG_PATH}'`;
					info({ message: `Validating ${label} schema ${location}` });

					validate(result.schema);
					success({ message: `${label} schema is valid.` });
				}
			} catch (err) {
				foundAny = true;
				hasErrors = true;
				error({ message: (err as Error).message });
			}
		}

		if (!foundAny) {
			throw new Error(`No schemas found. Make sure '${LOCAL_CONFIG_PATH}' exists and defines at least one schema.`);
		}

		if (hasErrors) {
			process.exitCode = CommandExitCodes.InvalidInput;
		}
	}
}
