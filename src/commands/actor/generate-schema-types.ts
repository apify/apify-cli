import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
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
	check,
	compile,
	normalizeDatasetSchema,
	normalizeInputSchema,
	normalizeKvstoreSchema,
} from '../../lib/schema-to-ts/index.js';
import type { CheckResult, CompileOptions, Diagnostic, Variant } from '../../lib/schema-to-ts/index.js';

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
		{
			description: 'Verify in CI that the committed types still match the schemas.',
			command: 'actor generate-schema-types --check',
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
		check: Flags.boolean({
			description:
				'Compare the already generated files against the schemas instead of writing them. Nothing is written, and the command exits with code 1 when a file is missing, was not written by this command, or no longer matches its schema.',
			required: false,
			default: false,
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

	private get verb() {
		return this.flags.check ? 'Checking' : 'Generating';
	}

	/** Set by any `--check` failure, anywhere in the fan-out, so `run` can pick the exit code. */
	private checkFailed = false;

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
					? `${this.verb} types from input schema at ${schemaPath}`
					: `${this.verb} types from input schema embedded in '${LOCAL_CONFIG_PATH}'`,
		});

		const outputDir = path.resolve(effectiveCwd, this.flags.output);

		if (!this.flags.check) {
			await mkdir(outputDir, { recursive: true });
		}

		await this.writeOrCheck({
			label: 'input',
			outputDir,
			fileName: 'input.ts',
			schema: normalizeInputSchema(inputSchema),
			opts: { types: [{ name: 'input', variant: this.variants.intoActor }] },
		});

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

		if (this.checkFailed) {
			process.exitCode = CommandExitCodes.CheckFailed;
		}
	}

	/**
	 * The single point where this command touches the output files: it either writes them or,
	 * under `--check`, reads them back and compares. Every schema goes through here, so the two
	 * modes cannot drift in which paths they consider.
	 */
	private async writeOrCheck({
		label,
		outputDir,
		fileName,
		schema,
		opts,
	}: {
		label: string;
		outputDir: string;
		fileName: string;
		schema: unknown;
		opts: CompileOptions;
	}) {
		const outputFile = path.join(outputDir, fileName);

		if (!this.flags.check) {
			const result = compile(schema, opts);
			notifyDiagnostics(label, result);

			await writeFile(outputFile, result.source, 'utf-8');
			success({ message: `Generated types written to ${outputFile}` });

			return;
		}

		const source = await readFile(outputFile, 'utf-8').catch((err: NodeJS.ErrnoException) => {
			if (err.code === 'ENOENT') {
				return null;
			}

			throw err;
		});

		if (source === null) {
			this.checkFailed = true;
			error({ message: `${outputFile} is missing — run 'apify actor generate-schema-types' to create it` });

			return;
		}

		const result = check(source, schema, opts);
		// Reported, but never a check failure: compiling reports the same diagnostics and still
		// exits 0, so failing here would leave `generate` followed by `--check` unpassable.
		notifyDiagnostics(label, result);

		if (result.stale) {
			this.checkFailed = true;
			error({ message: `${outputFile} ${explainStaleness(result)}` });

			return;
		}

		success({ message: `${outputFile} is up to date` });
	}

	private async generateDatasetTypes({ cwd, outputDir }: { cwd: string; outputDir: string }) {
		const datasetResult = readDatasetSchema({ cwd });

		if (!datasetResult) {
			return;
		}

		const { datasetSchema, datasetSchemaPath } = datasetResult;

		if (datasetSchemaPath) {
			info({ message: `[experimental] ${this.verb} types from Dataset schema at ${datasetSchemaPath}` });
		} else {
			info({
				message: `[experimental] ${this.verb} types from Dataset schema embedded in '${LOCAL_CONFIG_PATH}'`,
			});
		}

		await this.writeOrCheck({
			label: 'Dataset',
			outputDir,
			fileName: 'dataset.ts',
			schema: normalizeDatasetSchema(datasetSchema),
			opts: {
				types: [{ name: 'dataset', variant: this.variants.outOfActor }],
				unknownRoot: 'record',
			},
		});
	}

	private async generateOutputTypes({ cwd, outputDir }: { cwd: string; outputDir: string }) {
		const outputResult = readOutputSchema({ cwd });

		if (!outputResult) {
			return;
		}

		const { outputSchema, outputSchemaPath } = outputResult;

		if (outputSchemaPath) {
			info({ message: `[experimental] ${this.verb} types from Output schema at ${outputSchemaPath}` });
		} else {
			info({
				message: `[experimental] ${this.verb} types from Output schema embedded in '${LOCAL_CONFIG_PATH}'`,
			});
		}

		await this.writeOrCheck({
			label: 'output',
			outputDir,
			fileName: 'output.ts',
			schema: outputSchema,
			opts: { types: [{ name: 'output', variant: this.variants.outOfActor }] },
		});
	}

	private async generateKvsTypes({ cwd, outputDir }: { cwd: string; outputDir: string }) {
		const kvsResult = readStorageSchema({ cwd, key: 'keyValueStore', label: 'Key-Value Store' });

		if (!kvsResult) {
			return;
		}

		const { schema: kvsSchema, schemaPath: kvsSchemaPath } = kvsResult;

		if (kvsSchemaPath) {
			info({ message: `[experimental] ${this.verb} types from Key-Value Store schema at ${kvsSchemaPath}` });
		} else {
			info({
				message: `[experimental] ${this.verb} types from Key-Value Store schema embedded in '${LOCAL_CONFIG_PATH}'`,
			});
		}

		await this.writeOrCheck({
			label: 'key-value-store',
			outputDir,
			fileName: 'key-value-store.ts',
			schema: normalizeKvstoreSchema(kvsSchema),
			opts: { types: [{ name: 'keyValueStore', variant: this.variants.outOfActor }] },
		});
	}
}

/**
 * Why the file on disk does not match the schema. The two header problems are not staleness
 * and regenerating would clobber whatever is there, so they read as something to look at.
 */
function explainStaleness({ reason, expectedVersion, foundVersion }: CheckResult) {
	switch (reason) {
		case 'hash-mismatch':
			return "is out of date — the schema changed since it was generated, run 'apify actor generate-schema-types' to update it";
		case 'version-mismatch':
			return `was generated by a different generator version (v${foundVersion} instead of v${expectedVersion}), run 'apify actor generate-schema-types' to update it`;
		case 'missing-header':
			return 'carries no @generated header, so it was not written by this command';
		case 'duplicate-header':
			return 'carries more than one @generated header, most likely a botched merge';
		default:
			return `is stale (${reason})`;
	}
}

function notifyDiagnostics(label: string, result: { diagnostics: Diagnostic[] }) {
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
