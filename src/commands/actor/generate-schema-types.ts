import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { CommandExitCodes, LOCAL_CONFIG_PATH } from '../../lib/consts.js';
import {
	readAndValidateInputSchema,
	readDatasetSchema,
	readOutputSchema,
	readStorageSchema,
} from '../../lib/input_schema.js';
import { error, info, success, warning } from '../../lib/outputs.js';
import {
	compile,
	normalizeDatasetSchema,
	normalizeInputSchema,
	normalizeKvstoreSchema,
} from '../../lib/schema-to-ts/index.js';
import type { CompileResult, Diagnostic, Variant } from '../../lib/schema-to-ts/index.js';

const PERSPECTIVES = ['actor', 'user'] as const;
type Perspective = (typeof PERSPECTIVES)[number];

/**
 * The input flows into the Actor and every other storage flows out of it, so a single
 * perspective fixes the variant for every file.
 *
 * The side that reads the data gets `received`, which is precise: platform-materialized
 * defaults are present and unknown keys are a typo. The side that writes it gets `supplied`,
 * which is permissive: only `required` is mandatory and extras are allowed.
 */
const VARIANTS = {
	actor: { intoActor: 'received', outOfActor: 'supplied' },
	user: { intoActor: 'supplied', outOfActor: 'received' },
} as const satisfies Record<Perspective, Record<'intoActor' | 'outOfActor', Variant>>;

export class ActorGenerateSchemaTypesCommand extends ApifyCommand<typeof ActorGenerateSchemaTypesCommand> {
	static override name = 'generate-schema-types' as const;

	static override hiddenAliases = ['generate-types'];

	static override description = `Generate TypeScript types from Actor schemas.

Generates types from the input schema and, when no custom path is provided,
also from the Dataset, Output (experimental), and Key-Value Store (experimental)
schemas defined in '${LOCAL_CONFIG_PATH}'.

Reads the input schema from one of these locations (in priority order):
  1. Object in '${LOCAL_CONFIG_PATH}' under "input" key
  2. JSON file path in '${LOCAL_CONFIG_PATH}' "input" key
  3. .actor/INPUT_SCHEMA.json
  4. INPUT_SCHEMA.json

Optionally specify a custom schema file path, or a directory path.
When a directory is provided, all schemas are discovered from it
just as if the command were run from that directory with no argument.`;

	static override group = 'Actor Runtime';

	static override examples = [
		{
			description: 'Generate TypeScript types from the input schema into the default output directory.',
			command: 'actor generate-schema-types',
		},
		{
			description: 'Generate types from a custom schema path.',
			command: 'actor generate-schema-types ./schemas/my-input.json',
		},
		{
			description: 'Generate types for code that calls the Actor instead of code running inside it.',
			command: 'actor generate-schema-types --perspective user',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#actor-generate-schema-types';

	static override flags = {
		output: Flags.string({
			char: 'o',
			description:
				'Directory where the generated files should be outputted. Defaults to src/__generated__/actor/ to stay within the typical tsconfig rootDir.',
			required: false,
			default: path.join('src', '__generated__', 'actor'),
		}),
		perspective: Flags.string({
			description:
				"Whose side of the data to type. 'actor' is for code running inside the Actor: it reads the input and writes the storages. 'user' is for code calling the Actor: it writes the input and reads the storages.",
			required: false,
			choices: [...PERSPECTIVES],
			default: 'actor' satisfies Perspective,
		}),
	};

	static override args = {
		path: Args.string({
			required: false,
			description:
				'Optional path to an input schema file or a directory containing Actor schemas. If a directory is given, all schema types are generated from it. If not provided, searches default locations in the current directory.',
		}),
	};

	private get variants() {
		return VARIANTS[this.flags.perspective];
	}

	async run() {
		const cwd = process.cwd();

		let forcePath: string | undefined;
		let effectiveCwd = cwd;

		if (this.args.path) {
			const resolvedPath = path.resolve(cwd, this.args.path);
			// Ignore stat errors (e.g. path does not exist); downstream will surface a clear message.
			const isDirectory = await stat(resolvedPath)
				.then((s) => s.isDirectory())
				.catch(() => false);

			if (isDirectory) {
				effectiveCwd = resolvedPath;
			} else {
				forcePath = resolvedPath;
			}
		}

		const { inputSchema } = await readAndValidateInputSchema({
			forcePath,
			cwd: effectiveCwd,
			getMessage: (schemaPath) =>
				schemaPath
					? `Generating types from input schema at ${schemaPath}`
					: `Generating types from input schema embedded in '${LOCAL_CONFIG_PATH}'`,
		});

		const name = 'input';

		const result = compile(normalizeInputSchema(inputSchema), {
			types: [{ name, variant: this.variants.intoActor }],
		});
		notifyDiagnostics('input', result);

		const outputDir = path.resolve(effectiveCwd, this.flags.output);
		await mkdir(outputDir, { recursive: true });

		const outputFile = path.join(outputDir, `${name}.ts`);
		await writeFile(outputFile, result.source, 'utf-8');

		success({ message: `Generated types written to ${outputFile}` });

		// When no specific file path is provided, also generate types from additional schemas
		// (this includes both "no argument" and "directory argument" modes)
		if (!forcePath) {
			const schemaResults = await Promise.allSettled([
				this.generateDatasetTypes({ cwd: effectiveCwd, outputDir }),
				this.generateOutputTypes({ cwd: effectiveCwd, outputDir }),
				this.generateKvsTypes({ cwd: effectiveCwd, outputDir }),
			]);

			const schemaLabels = ['Dataset', 'Output', 'Key-Value Store'];
			let anyFailed = false;

			for (const [i, schemaResult] of schemaResults.entries()) {
				if (schemaResult.status === 'rejected') {
					anyFailed = true;
					error({
						message: `Failed to generate types for ${schemaLabels[i]} schema: ${schemaResult.reason instanceof Error ? schemaResult.reason.message : String(schemaResult.reason)}`,
					});
				}
			}

			if (anyFailed) {
				process.exitCode = CommandExitCodes.BuildFailed;
			}
		}
	}

	private async generateDatasetTypes({ cwd, outputDir }: { cwd: string; outputDir: string }) {
		const datasetResult = readDatasetSchema({ cwd });

		if (!datasetResult) {
			return;
		}

		const { datasetSchema, datasetSchemaPath } = datasetResult;

		if (datasetSchemaPath) {
			info({ message: `[experimental] Generating types from Dataset schema at ${datasetSchemaPath}` });
		} else {
			info({ message: `[experimental] Generating types from Dataset schema embedded in '${LOCAL_CONFIG_PATH}'` });
		}

		const datasetName = 'dataset';

		const result = compile(normalizeDatasetSchema(datasetSchema), {
			types: [{ name: datasetName, variant: this.variants.outOfActor }],
			unknownRoot: 'record',
		});
		notifyDiagnostics('Dataset', result);

		const outputFile = path.join(outputDir, `${datasetName}.ts`);
		await writeFile(outputFile, result.source, 'utf-8');

		success({ message: `Generated types written to ${outputFile}` });
	}

	private async generateOutputTypes({ cwd, outputDir }: { cwd: string; outputDir: string }) {
		const outputResult = readOutputSchema({ cwd });

		if (!outputResult) {
			return;
		}

		const { outputSchema, outputSchemaPath } = outputResult;

		if (outputSchemaPath) {
			info({ message: `[experimental] Generating types from Output schema at ${outputSchemaPath}` });
		} else {
			info({ message: `[experimental] Generating types from Output schema embedded in '${LOCAL_CONFIG_PATH}'` });
		}

		const outputName = 'output';

		const result = compile(outputSchema, {
			types: [{ name: outputName, variant: this.variants.outOfActor }],
		});
		notifyDiagnostics('output', result);

		const outputFile = path.join(outputDir, `${outputName}.ts`);
		await writeFile(outputFile, result.source, 'utf-8');

		success({ message: `Generated types written to ${outputFile}` });
	}

	private async generateKvsTypes({ cwd, outputDir }: { cwd: string; outputDir: string }) {
		const kvsResult = readStorageSchema({ cwd, key: 'keyValueStore', label: 'Key-Value Store' });

		if (!kvsResult) {
			return;
		}

		const { schema: kvsSchema, schemaPath: kvsSchemaPath } = kvsResult;

		if (kvsSchemaPath) {
			info({ message: `[experimental] Generating types from Key-Value Store schema at ${kvsSchemaPath}` });
		} else {
			info({
				message: `[experimental] Generating types from Key-Value Store schema embedded in '${LOCAL_CONFIG_PATH}'`,
			});
		}

		const kvsName = 'keyValueStore';

		const result = compile(normalizeKvstoreSchema(kvsSchema), {
			types: [{ name: kvsName, variant: this.variants.outOfActor }],
		});
		notifyDiagnostics('key-value-store', result);

		const outputFile = path.join(outputDir, 'key-value-store.ts');
		await writeFile(outputFile, result.source, 'utf-8');

		success({ message: `Generated types written to ${outputFile}` });
	}
}

function notifyDiagnostics(label: string, result: CompileResult) {
	const errors: Diagnostic[] = [];
	const warnings: Diagnostic[] = [];

	for (const diagnostic of result.diagnostics) {
		(diagnostic.severity === 'error' ? errors : warnings).push(diagnostic);
	}

	const format = (diagnostics: Diagnostic[]) =>
		diagnostics.map(({ path: at, code, message }) => `  ${at || '<root>'} [${code}] ${message}`).join('\n');

	if (errors.length > 0) {
		error({
			message: `Found ${errors.length} error(s) in the ${label} schema:\n${format(errors)}`,
		});
	}

	if (warnings.length > 0) {
		warning({
			message: `Found ${warnings.length} unsupported construct(s) in the ${label} schema, the affected values are typed as 'unknown':\n${format(warnings)}`,
		});
	}
}
