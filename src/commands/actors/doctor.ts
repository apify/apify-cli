import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import chalk from 'chalk';

import { validateInputSchema } from '@apify/input_schema';
import { getActorSchemaValidator } from '@apify/json_schemas';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { CommandExitCodes, DEPRECATED_LOCAL_CONFIG_NAME, LOCAL_CONFIG_PATH } from '../../lib/consts.js';
import {
	readDatasetSchemas,
	readInputSchema,
	readOutputSchema,
	readStorageSchema,
	validateDatasetSchema,
	validateKvsSchema,
	validateOutputSchema,
} from '../../lib/input_schema.js';
import { simpleLog } from '../../lib/outputs.js';
import { Ajv2019, validateActorName } from '../../lib/utils.js';

type DiagnosticSeverity = 'error' | 'warning' | 'pass';

interface Diagnostic {
	severity: DiagnosticSeverity;
	code: string;
	message: string;
}

// Strip ASCII control chars (0x00–0x1F, 0x7F) from terminal output.
// This prevents escape-sequence injection from project-controlled values
// such as actor names or schema paths in actor.json.
function sanitizeForTerminal(value: string): string {
	// eslint-disable-next-line no-control-regex
	return value.replace(/[\u0000-\u001f\u007f]/g, '');
}

function renderDiagnostics(diagnostics: Diagnostic[]): void {
	const lines = diagnostics.map((d) => {
		const icon =
			d.severity === 'pass' ? chalk.green('✓') : d.severity === 'warning' ? chalk.yellow('⚠') : chalk.red('✗');
		return `  ${icon} ${sanitizeForTerminal(d.message)}`;
	});

	simpleLog({ message: lines.join('\n') });
}

async function gatherDiagnostics(cwd: string): Promise<Diagnostic[]> {
	const diagnostics: Diagnostic[] = [];

	const deprecatedConfigPath = join(cwd, DEPRECATED_LOCAL_CONFIG_NAME);
	const actorJsonPath = join(cwd, LOCAL_CONFIG_PATH);

	if (existsSync(deprecatedConfigPath) && !existsSync(actorJsonPath)) {
		diagnostics.push({
			severity: 'warning',
			code: 'DEPRECATED_CONFIG',
			message: `Deprecated "apify.json" detected. Run "apify actors push" to trigger automatic migration to ".actor/actor.json".`,
		});
	}

	if (!existsSync(actorJsonPath)) {
		diagnostics.push({
			severity: 'error',
			code: 'ACTOR_JSON_NOT_FOUND',
			message: `".actor/actor.json" not found. Run "apify actors pull" or "apify create" to initialise an Actor project.`,
		});
		return diagnostics;
	}

	diagnostics.push({ severity: 'pass', code: 'ACTOR_JSON_FOUND', message: `".actor/actor.json" found.` });

	let actorConfig: Record<string, unknown>;

	try {
		actorConfig = JSON.parse(readFileSync(actorJsonPath, { encoding: 'utf-8' }));
	} catch (ex) {
		diagnostics.push({
			severity: 'error',
			code: 'ACTOR_JSON_PARSE_FAILED',
			message: `".actor/actor.json" is not valid JSON: ${(ex as Error).message}`,
		});
		return diagnostics;
	}

	const validate = getActorSchemaValidator();
	if (!validate(actorConfig)) {
		for (const ajvError of validate.errors ?? []) {
			const path = ajvError.instancePath ? ` at ${ajvError.instancePath}` : '';
			diagnostics.push({
				severity: 'error',
				code: 'ACTOR_JSON_SCHEMA_INVALID',
				message: `".actor/actor.json" schema error${path}: ${ajvError.message}`,
			});
		}
		// All subsequent checks require a valid actor object (access actorConfig.name, .storages, etc.).
		// Return early to prevent runtime errors on non-object values such as null, [], "string", 123.
		return diagnostics;
	}

	diagnostics.push({ severity: 'pass', code: 'ACTOR_JSON_VALID', message: `".actor/actor.json" is valid.` });

	if (typeof actorConfig.name === 'string') {
		try {
			validateActorName(actorConfig.name);
			diagnostics.push({
				severity: 'pass',
				code: 'ACTOR_NAME_VALID',
				message: `Actor name "${actorConfig.name}" is valid.`,
			});
		} catch (ex) {
			diagnostics.push({
				severity: 'error',
				code: 'ACTOR_NAME_INVALID',
				message: `Actor name "${actorConfig.name}" is invalid: ${(ex as Error).message}`,
			});
		}
	}

	// Input schema — supports both `input` and `inputSchema` fields
	try {
		const { inputSchema } = await readInputSchema({ cwd, throwOnMissing: true });
		if (inputSchema) {
			try {
				const ajv = new Ajv2019({ strict: false });
				validateInputSchema(ajv, inputSchema);
				diagnostics.push({ severity: 'pass', code: 'INPUT_SCHEMA_VALID', message: `Input schema is valid.` });
			} catch (ex) {
				diagnostics.push({
					severity: 'error',
					code: 'INPUT_SCHEMA_INVALID',
					message: `Input schema is invalid: ${(ex as Error).message}`,
				});
			}
		}
	} catch (ex) {
		if (ex instanceof SyntaxError) {
			diagnostics.push({
				severity: 'error',
				code: 'INPUT_SCHEMA_PARSE_FAILED',
				message: `Input schema file contains malformed JSON: ${ex.message}`,
			});
		} else {
			diagnostics.push({
				severity: 'error',
				code: 'INPUT_SCHEMA_REF_MISSING',
				message: (ex as Error).message,
			});
		}
	}

	// Dataset schemas — supports both `storages.dataset` and `storages.datasets`
	const datasetEntries = readDatasetSchemas({ cwd });
	if (datasetEntries) {
		for (const entry of datasetEntries) {
			const label = entry.form === 'singular' ? 'Dataset schema' : `Dataset schema "${entry.name}"`;
			if (entry.errorCode === 'ref-missing') {
				diagnostics.push({
					severity: 'error',
					code: 'DATASET_SCHEMA_REF_MISSING',
					message: entry.errorMessage!,
				});
			} else if (entry.errorCode === 'parse-failed') {
				diagnostics.push({
					severity: 'error',
					code: 'DATASET_SCHEMA_PARSE_FAILED',
					message: entry.errorMessage!,
				});
			} else if (entry.schema) {
				try {
					validateDatasetSchema(entry.schema);
					diagnostics.push({ severity: 'pass', code: 'DATASET_SCHEMA_VALID', message: `${label} is valid.` });
				} catch (ex) {
					diagnostics.push({
						severity: 'error',
						code: 'DATASET_SCHEMA_INVALID',
						message: `${label} is invalid: ${(ex as Error).message}`,
					});
				}
			}
		}
	}

	// Output schema — supports both `output` and `outputSchema` fields
	try {
		const result = readOutputSchema({ cwd, throwOnMissing: true });
		if (result) {
			try {
				validateOutputSchema(result.outputSchema);
				diagnostics.push({ severity: 'pass', code: 'OUTPUT_SCHEMA_VALID', message: `Output schema is valid.` });
			} catch (ex) {
				diagnostics.push({
					severity: 'error',
					code: 'OUTPUT_SCHEMA_INVALID',
					message: `Output schema is invalid: ${(ex as Error).message}`,
				});
			}
		}
	} catch (ex) {
		if (ex instanceof SyntaxError) {
			diagnostics.push({
				severity: 'error',
				code: 'OUTPUT_SCHEMA_PARSE_FAILED',
				message: `Output schema file contains malformed JSON: ${ex.message}`,
			});
		} else {
			diagnostics.push({
				severity: 'error',
				code: 'OUTPUT_SCHEMA_REF_MISSING',
				message: (ex as Error).message,
			});
		}
	}

	// Key-Value Store schema — supports `storages.keyValueStore`
	try {
		const result = readStorageSchema({ cwd, key: 'keyValueStore', label: 'Key-Value Store', throwOnMissing: true });
		if (result) {
			try {
				validateKvsSchema(result.schema);
				diagnostics.push({
					severity: 'pass',
					code: 'KVS_SCHEMA_VALID',
					message: `Key-Value Store schema is valid.`,
				});
			} catch (ex) {
				diagnostics.push({
					severity: 'error',
					code: 'KVS_SCHEMA_INVALID',
					message: `Key-Value Store schema is invalid: ${(ex as Error).message}`,
				});
			}
		}
	} catch (ex) {
		if (ex instanceof SyntaxError) {
			diagnostics.push({
				severity: 'error',
				code: 'KVS_SCHEMA_PARSE_FAILED',
				message: `Key-Value Store schema file contains malformed JSON: ${ex.message}`,
			});
		} else {
			diagnostics.push({
				severity: 'error',
				code: 'KVS_SCHEMA_REF_MISSING',
				message: (ex as Error).message,
			});
		}
	}

	return diagnostics;
}

export class ActorsDoctorCommand extends ApifyCommand<typeof ActorsDoctorCommand> {
	static override name = 'doctor' as const;

	static override description =
		`Run local diagnostics on the Actor project in the current directory.\n` +
		`Checks actor.json structure, schema references, and schema validity. No network calls are made.`;

	static override group = 'Apify Console';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-actors-doctor';

	static override examples = [
		{
			description: 'Check the Actor project in the current directory',
			command: 'apify actors doctor',
		},
	];

	async run() {
		const cwd = process.cwd();
		const diagnostics = await gatherDiagnostics(cwd);

		renderDiagnostics(diagnostics);

		const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
		const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

		if (errorCount === 0 && warningCount === 0) {
			simpleLog({ message: chalk.green('\nNo issues found.') });
		} else {
			const parts: string[] = [];
			if (errorCount > 0) parts.push(chalk.red(`${errorCount} error${errorCount !== 1 ? 's' : ''}`));
			if (warningCount > 0) parts.push(chalk.yellow(`${warningCount} warning${warningCount !== 1 ? 's' : ''}`));
			simpleLog({ message: `\n${parts.join(', ')}` });
		}

		if (errorCount > 0) {
			process.exitCode = CommandExitCodes.InvalidActorJson;
		}
	}
}
