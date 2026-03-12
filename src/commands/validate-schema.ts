import process from 'node:process';

import { validateInputSchema } from '@apify/input_schema';

import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { CommandExitCodes, LOCAL_CONFIG_PATH } from '../lib/consts.js';
import {
	readDatasetSchema,
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
		const { inputSchema } = await readInputSchema({ forcePath, cwd: process.cwd() });

		if (!inputSchema) {
			throw new Error(`Input schema has not been found at ${forcePath}.`);
		}

		info({ message: `Validating input schema at ${forcePath}` });

		const validator = new Ajv2019({ strict: false });
		validateInputSchema(validator, inputSchema);

		success({ message: 'Input schema is valid.' });
	}

	private async validateAllSchemas() {
		const cwd = process.cwd();
		let foundAny = false;
		let hasErrors = false;

		// Input schema
		const { inputSchema, inputSchemaPath } = await readInputSchema({ cwd });

		if (inputSchema) {
			foundAny = true;

			const location = inputSchemaPath
				? `at ${inputSchemaPath}`
				: `embedded in '${LOCAL_CONFIG_PATH}'`;
			info({ message: `Validating input schema ${location}` });

			try {
				const validator = new Ajv2019({ strict: false });
				validateInputSchema(validator, inputSchema);
				success({ message: 'Input schema is valid.' });
			} catch (err) {
				hasErrors = true;
				error({ message: (err as Error).message });
			}
		}

		// Dataset schema
		const datasetResult = readDatasetSchema({ cwd });

		if (datasetResult) {
			foundAny = true;

			const location = datasetResult.datasetSchemaPath
				? `at ${datasetResult.datasetSchemaPath}`
				: `embedded in '${LOCAL_CONFIG_PATH}'`;
			info({ message: `Validating Dataset schema ${location}` });

			try {
				validateDatasetSchema(datasetResult.datasetSchema);
				success({ message: 'Dataset schema is valid.' });
			} catch (err) {
				hasErrors = true;
				error({ message: (err as Error).message });
			}
		}

		// Output schema
		const outputResult = readOutputSchema({ cwd });

		if (outputResult) {
			foundAny = true;

			const location = outputResult.outputSchemaPath
				? `at ${outputResult.outputSchemaPath}`
				: `embedded in '${LOCAL_CONFIG_PATH}'`;
			info({ message: `Validating Output schema ${location}` });

			try {
				validateOutputSchema(outputResult.outputSchema);
				success({ message: 'Output schema is valid.' });
			} catch (err) {
				hasErrors = true;
				error({ message: (err as Error).message });
			}
		}

		// Key-Value Store schema
		const kvsResult = readStorageSchema({ cwd, key: 'keyValueStore', label: 'Key-Value Store' });

		if (kvsResult) {
			foundAny = true;

			const location = kvsResult.schemaPath
				? `at ${kvsResult.schemaPath}`
				: `embedded in '${LOCAL_CONFIG_PATH}'`;
			info({ message: `Validating Key-Value Store schema ${location}` });

			try {
				validateKvsSchema(kvsResult.schema);
				success({ message: 'Key-Value Store schema is valid.' });
			} catch (err) {
				hasErrors = true;
				error({ message: (err as Error).message });
			}
		}

		if (!foundAny) {
			throw new Error(`No schemas found. Make sure '${LOCAL_CONFIG_PATH}' exists and defines at least one schema.`);
		}

		if (hasErrors) {
			process.exitCode = CommandExitCodes.BuildFailed;
		}
	}
}
