import process from 'node:process';

import { validateInputSchema } from '@apify/input_schema';

import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { CommandExitCodes, LOCAL_CONFIG_PATH } from '../lib/consts.js';
import {
	readAndValidateInputSchema,
	readDatasetSchemas,
	readInputSchema,
	readOutputSchema,
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
  - Input schema (from "input" or "inputSchema" key, or default locations)
  - Dataset schema (from "storages.dataset" or "storages.datasets")
  - Output schema (from "output" or "outputSchema")
  - Key-Value Store schema (from "storages.keyValueStore")`;

	static override group = 'Local Actor Development';

	static override examples = [
		{
			description: 'Validate the input schema discovered from the default locations.',
			command: 'apify validate-schema',
		},
		{
			description: 'Validate a specific INPUT_SCHEMA.json file.',
			command: 'apify validate-schema ./my-schema.json',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-validate-schema';

	static override args = {
		path: Args.string({
			required: false,
			description: `Optional path to your INPUT_SCHEMA.json file. If not provided, validates all schemas in '${LOCAL_CONFIG_PATH}'.`,
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
		// Supports both `input` and `inputSchema` fields.
		try {
			const { inputSchema, inputSchemaPath } = await readInputSchema({ cwd, throwOnMissing: true });

			if (inputSchema) {
				foundAny = true;

				const location = inputSchemaPath ? `at ${inputSchemaPath}` : `embedded in '${LOCAL_CONFIG_PATH}'`;
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

		// Dataset schemas — supports both `storages.dataset` and `storages.datasets`
		const datasetEntries = readDatasetSchemas({ cwd });
		if (datasetEntries) {
			for (const entry of datasetEntries) {
				foundAny = true;
				if (entry.errorCode) {
					hasErrors = true;
					error({ message: entry.errorMessage! });
				} else if (entry.schema) {
					const label = entry.form === 'singular' ? 'Dataset schema' : `Dataset schema "${entry.name}"`;
					const location = entry.schemaPath ? `at ${entry.schemaPath}` : `embedded in '${LOCAL_CONFIG_PATH}'`;
					info({ message: `Validating ${label} ${location}` });
					try {
						validateDatasetSchema(entry.schema);
						success({ message: `${label} is valid.` });
					} catch (err) {
						hasErrors = true;
						error({ message: (err as Error).message });
					}
				}
			}
		}

		// Output schema — supports both `output` and `outputSchema` fields
		try {
			const result = readOutputSchema({ cwd, throwOnMissing: true });
			if (result) {
				foundAny = true;
				const location = result.outputSchemaPath
					? `at ${result.outputSchemaPath}`
					: `embedded in '${LOCAL_CONFIG_PATH}'`;
				info({ message: `Validating Output schema ${location}` });
				validateOutputSchema(result.outputSchema);
				success({ message: 'Output schema is valid.' });
			}
		} catch (err) {
			foundAny = true;
			hasErrors = true;
			error({ message: (err as Error).message });
		}

		// Key-Value Store schema
		try {
			const result = readStorageSchema({ cwd, key: 'keyValueStore', label: 'Key-Value Store', throwOnMissing: true });
			if (result) {
				foundAny = true;
				const location = result.schemaPath ? `at ${result.schemaPath}` : `embedded in '${LOCAL_CONFIG_PATH}'`;
				info({ message: `Validating Key-Value Store schema ${location}` });
				validateKvsSchema(result.schema);
				success({ message: 'Key-Value Store schema is valid.' });
			}
		} catch (err) {
			foundAny = true;
			hasErrors = true;
			error({ message: (err as Error).message });
		}

		if (!foundAny) {
			throw new Error(`No schemas found. Make sure '${LOCAL_CONFIG_PATH}' exists and defines at least one schema.`);
		}

		if (hasErrors) {
			process.exitCode = CommandExitCodes.InvalidInput;
		}
	}
}
