import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { ActorsDoctorCommand } from '../../../../src/commands/actors/doctor.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { CommandExitCodes } from '../../../../src/lib/consts.js';
import { validDatasetSchemaPath } from '../../../__setup__/dataset-schemas/paths.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';
import { invalidInputSchemaPath, validInputSchemaPath } from '../../../__setup__/input-schemas/paths.js';
import { validKvsSchemaPath } from '../../../__setup__/kvs-schemas/paths.js';
import { validOutputSchemaPath } from '../../../__setup__/output-schemas/paths.js';

const { logMessages } = useConsoleSpy();

const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath('actors-doctor', {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

beforeEach(async () => {
	await beforeAllCalls();
	process.exitCode = undefined;
});

afterEach(async () => {
	await afterAllCalls();
	process.exitCode = undefined;
});

async function writeActorJson(basePath: string, content: Record<string, unknown>) {
	const actorDir = join(basePath, '.actor');
	await mkdir(actorDir, { recursive: true });
	await writeFile(join(actorDir, 'actor.json'), JSON.stringify(content, null, '\t'));
}

async function writeActorJsonRaw(basePath: string, raw: string) {
	const actorDir = join(basePath, '.actor');
	await mkdir(actorDir, { recursive: true });
	await writeFile(join(actorDir, 'actor.json'), raw);
}

async function copySchemaFile(srcPath: string, destDir: string, destName: string): Promise<string> {
	const content = await readFile(srcPath, 'utf-8');
	await writeFile(join(destDir, destName), content);
	return `./${destName}`;
}

const VALID_ACTOR_BASE = { actorSpecification: 1, name: 'my-actor', version: '0.1' };
const INVALID_DATASET = { fields: {}, views: {} }; // missing actorSpecification
const INVALID_OUTPUT = { properties: {} }; // missing actorOutputSchemaVersion
const INVALID_KVS = { collections: {} }; // missing actorKeyValueStoreSchemaVersion

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function allOutput() {
	return logMessages.error.join('\n');
}

// ---------------------------------------------------------------------------
// Missing actor.json
// ---------------------------------------------------------------------------

describe('apify actors doctor', () => {
	describe('missing actor.json', () => {
		it('reports ACTOR_JSON_NOT_FOUND error and exits 5 when .actor/actor.json is absent', async () => {
			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('.actor/actor.json" not found');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('emits DEPRECATED_CONFIG warning when only apify.json exists', async () => {
			await writeFile(join(joinPath(), 'apify.json'), JSON.stringify({ name: 'old-actor' }));

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Deprecated "apify.json"');
			expect(allOutput()).toContain('.actor/actor.json" not found');
		});

		it('deprecated config message does not claim doctor will migrate', async () => {
			await writeFile(join(joinPath(), 'apify.json'), JSON.stringify({ name: 'old-actor' }));

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).not.toContain('run any actors command');
			expect(allOutput()).toContain('apify actors push');
		});
	});

	// ---------------------------------------------------------------------------
	// Malformed actor.json
	// ---------------------------------------------------------------------------

	describe('malformed actor.json', () => {
		it('reports ACTOR_JSON_PARSE_FAILED error for invalid JSON', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(join(actorDir, 'actor.json'), '{ invalid json }');

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('is not valid JSON');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});
	});

	// ---------------------------------------------------------------------------
	// actor.json schema validation
	// ---------------------------------------------------------------------------

	describe('actor.json schema validation', () => {
		it('reports ACTOR_JSON_SCHEMA_INVALID errors for a schema-invalid actor.json', async () => {
			await writeActorJson(joinPath(), { actorSpecification: 1 }); // missing name and version

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('schema error');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('passes for a valid minimal actor.json', async () => {
			await writeActorJson(joinPath(), VALID_ACTOR_BASE);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('.actor/actor.json" is valid');
			expect(process.exitCode).not.toBe(CommandExitCodes.InvalidActorJson);
		});
	});

	// ---------------------------------------------------------------------------
	// Actor name validation
	// ---------------------------------------------------------------------------

	describe('actor name validation', () => {
		it('reports ACTOR_NAME_INVALID when name is too short', async () => {
			await writeActorJson(joinPath(), { ...VALID_ACTOR_BASE, name: 'ab' });

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Actor name "ab" is invalid');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('passes for a valid actor name', async () => {
			await writeActorJson(joinPath(), VALID_ACTOR_BASE);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Actor name "my-actor" is valid');
		});
	});

	// ---------------------------------------------------------------------------
	// Input schema — `input` field
	// ---------------------------------------------------------------------------

	describe('input schema via `input` field', () => {
		it('reports INPUT_SCHEMA_REF_MISSING when referenced file is absent', async () => {
			await writeActorJson(joinPath(), { ...VALID_ACTOR_BASE, input: './missing.json' });

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('missing.json');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports INPUT_SCHEMA_PARSE_FAILED for a malformed JSON file — distinct from ref-missing', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(join(actorDir, 'input_schema.json'), '{ bad json');
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, input: './input_schema.json' }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('malformed JSON');
			expect(allOutput()).not.toContain('not found');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports INPUT_SCHEMA_INVALID for a structurally invalid schema — distinct from parse-failed', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await copySchemaFile(invalidInputSchemaPath, actorDir, 'input_schema.json');
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, input: './input_schema.json' }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Input schema is invalid');
			expect(allOutput()).not.toContain('malformed JSON');
			expect(allOutput()).not.toContain('not found');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('passes for a valid input schema via `input`', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await copySchemaFile(validInputSchemaPath, actorDir, 'input_schema.json');
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, input: './input_schema.json' }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Input schema is valid');
			expect(process.exitCode).not.toBe(CommandExitCodes.InvalidActorJson);
		});
	});

	// ---------------------------------------------------------------------------
	// Input schema — `inputSchema` alias
	// ---------------------------------------------------------------------------

	describe('input schema via `inputSchema` alias', () => {
		it('passes for a valid input schema via `inputSchema`', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await copySchemaFile(validInputSchemaPath, actorDir, 'input_schema.json');
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, inputSchema: './input_schema.json' }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Input schema is valid');
			expect(process.exitCode).not.toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports INPUT_SCHEMA_REF_MISSING when file referenced by `inputSchema` is absent', async () => {
			await writeActorJson(joinPath(), { ...VALID_ACTOR_BASE, inputSchema: './missing.json' });

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('missing.json');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports INPUT_SCHEMA_PARSE_FAILED for malformed JSON via `inputSchema`', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(join(actorDir, 'input_schema.json'), '{ bad json');
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, inputSchema: './input_schema.json' }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('malformed JSON');
			expect(allOutput()).not.toContain('not found');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports INPUT_SCHEMA_INVALID for a structurally invalid schema via `inputSchema`', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await copySchemaFile(invalidInputSchemaPath, actorDir, 'input_schema.json');
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, inputSchema: './input_schema.json' }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Input schema is invalid');
			expect(allOutput()).not.toContain('malformed JSON');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});
	});

	// ---------------------------------------------------------------------------
	// Dataset schema — `storages.dataset` (singular)
	// ---------------------------------------------------------------------------

	describe('dataset schema via `storages.dataset`', () => {
		it('reports DATASET_SCHEMA_REF_MISSING when referenced file is absent', async () => {
			await writeActorJson(joinPath(), { ...VALID_ACTOR_BASE, storages: { dataset: './missing.json' } });

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('missing.json');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports DATASET_SCHEMA_PARSE_FAILED for malformed JSON — distinct from ref-missing', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(join(actorDir, 'dataset.json'), '{ bad json');
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, storages: { dataset: './dataset.json' } }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('malformed JSON');
			expect(allOutput()).not.toContain('not found');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports DATASET_SCHEMA_INVALID for a structurally invalid dataset schema file', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(join(actorDir, 'dataset.json'), JSON.stringify(INVALID_DATASET));
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, storages: { dataset: './dataset.json' } }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Dataset schema is invalid');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('passes for a valid embedded dataset schema', async () => {
			const schemaContent = JSON.parse(await readFile(validDatasetSchemaPath, 'utf-8'));
			await writeActorJson(joinPath(), { ...VALID_ACTOR_BASE, storages: { dataset: schemaContent } });

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Dataset schema is valid');
			expect(process.exitCode).not.toBe(CommandExitCodes.InvalidActorJson);
		});
	});

	// ---------------------------------------------------------------------------
	// Dataset schema — `storages.datasets` (plural with named entries)
	// ---------------------------------------------------------------------------

	describe('dataset schemas via `storages.datasets`', () => {
		it('passes for a valid datasets entry', async () => {
			const schemaContent = JSON.parse(await readFile(validDatasetSchemaPath, 'utf-8'));
			await writeActorJson(joinPath(), {
				...VALID_ACTOR_BASE,
				storages: { datasets: { default: schemaContent } },
			});

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Dataset schema "default" is valid');
			expect(process.exitCode).not.toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports DATASET_SCHEMA_REF_MISSING for a missing named datasets file', async () => {
			await writeActorJson(joinPath(), {
				...VALID_ACTOR_BASE,
				storages: { datasets: { default: './missing.json' } },
			});

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('missing.json');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports DATASET_SCHEMA_PARSE_FAILED for malformed JSON in a named datasets entry', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(join(actorDir, 'default.json'), '{ bad json');
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, storages: { datasets: { default: './default.json' } } }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('malformed JSON');
			expect(allOutput()).not.toContain('not found');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports DATASET_SCHEMA_INVALID for a structurally invalid named dataset schema', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(join(actorDir, 'default.json'), JSON.stringify(INVALID_DATASET));
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, storages: { datasets: { default: './default.json' } } }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Dataset schema "default" is invalid');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports the invalid entry while the valid entry passes — both reported', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			// Valid entry: embed the schema directly (passes actor.json schema validation)
			const schemaContent = JSON.parse(await readFile(validDatasetSchemaPath, 'utf-8'));
			// Invalid entry: must be a file reference so actor.json schema passes
			await writeFile(join(actorDir, 'errors.json'), JSON.stringify(INVALID_DATASET));
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({
					...VALID_ACTOR_BASE,
					storages: {
						datasets: {
							default: schemaContent,
							errors: './errors.json',
						},
					},
				}),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Dataset schema "default" is valid');
			expect(allOutput()).toContain('Dataset schema "errors" is invalid');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});
	});

	// ---------------------------------------------------------------------------
	// Output schema — `output` field
	// ---------------------------------------------------------------------------

	describe('output schema via `output` field', () => {
		it('reports OUTPUT_SCHEMA_REF_MISSING when referenced file is absent', async () => {
			await writeActorJson(joinPath(), { ...VALID_ACTOR_BASE, output: './missing.json' });

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('missing.json');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports OUTPUT_SCHEMA_PARSE_FAILED for malformed JSON — distinct from ref-missing', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(join(actorDir, 'output.json'), '{ bad json');
			await writeFile(join(actorDir, 'actor.json'), JSON.stringify({ ...VALID_ACTOR_BASE, output: './output.json' }));

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('malformed JSON');
			expect(allOutput()).not.toContain('not found');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports OUTPUT_SCHEMA_INVALID for a structurally invalid output schema file', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(join(actorDir, 'output.json'), JSON.stringify(INVALID_OUTPUT));
			await writeFile(join(actorDir, 'actor.json'), JSON.stringify({ ...VALID_ACTOR_BASE, output: './output.json' }));

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Output schema is invalid');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('passes for a valid output schema via `output`', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await copySchemaFile(validOutputSchemaPath, actorDir, 'output-schema.json');
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, output: './output-schema.json' }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Output schema is valid');
			expect(process.exitCode).not.toBe(CommandExitCodes.InvalidActorJson);
		});
	});

	// ---------------------------------------------------------------------------
	// Output schema — `outputSchema` alias
	// ---------------------------------------------------------------------------

	describe('output schema via `outputSchema` alias', () => {
		it('passes for a valid output schema via `outputSchema`', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await copySchemaFile(validOutputSchemaPath, actorDir, 'output-schema.json');
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, outputSchema: './output-schema.json' }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Output schema is valid');
			expect(process.exitCode).not.toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports OUTPUT_SCHEMA_REF_MISSING when file referenced by `outputSchema` is absent', async () => {
			await writeActorJson(joinPath(), { ...VALID_ACTOR_BASE, outputSchema: './missing.json' });

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('missing.json');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports OUTPUT_SCHEMA_PARSE_FAILED for malformed JSON via `outputSchema`', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(join(actorDir, 'output.json'), '{ bad json');
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, outputSchema: './output.json' }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('malformed JSON');
			expect(allOutput()).not.toContain('not found');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports OUTPUT_SCHEMA_INVALID for a structurally invalid schema via `outputSchema`', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(join(actorDir, 'output.json'), JSON.stringify(INVALID_OUTPUT));
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, outputSchema: './output.json' }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Output schema is invalid');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});
	});

	// ---------------------------------------------------------------------------
	// KVS schema
	// ---------------------------------------------------------------------------

	describe('KVS schema', () => {
		it('reports KVS_SCHEMA_REF_MISSING for a missing KVS schema file', async () => {
			await writeActorJson(joinPath(), { ...VALID_ACTOR_BASE, storages: { keyValueStore: './missing.json' } });

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('missing.json');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports KVS_SCHEMA_PARSE_FAILED for malformed JSON — distinct from ref-missing', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(join(actorDir, 'kvs.json'), '{ bad json');
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, storages: { keyValueStore: './kvs.json' } }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('malformed JSON');
			expect(allOutput()).not.toContain('not found');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports KVS_SCHEMA_INVALID for a structurally invalid KVS schema file', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(join(actorDir, 'kvs.json'), JSON.stringify(INVALID_KVS));
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({ ...VALID_ACTOR_BASE, storages: { keyValueStore: './kvs.json' } }),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('Key-Value Store schema is invalid');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});
	});

	// ---------------------------------------------------------------------------
	// Multiple simultaneous diagnostics
	// ---------------------------------------------------------------------------

	describe('multiple simultaneous diagnostics', () => {
		it('reports all errors without stopping at the first failure', async () => {
			// Datasets and output must be file-referenced so actor.json schema validation passes;
			// the individual schema validators then flag the content as structurally invalid.
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(join(actorDir, 'dataset-default.json'), JSON.stringify(INVALID_DATASET));
			await writeFile(join(actorDir, 'dataset-errors.json'), JSON.stringify(INVALID_DATASET));
			await writeFile(join(actorDir, 'output.json'), JSON.stringify(INVALID_OUTPUT));
			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({
					...VALID_ACTOR_BASE,
					name: 'ab', // invalid name (too short)
					inputSchema: {
						// embedded invalid input schema (passes actor.json schema)
						title: 'Bad',
						type: 'object',
						schemaVersion: 1,
						properties: { q: { title: 'Q', type: 'string', editor: 'spaceEditor' } },
					},
					outputSchema: './output.json',
					storages: {
						datasets: {
							default: './dataset-default.json',
							errors: './dataset-errors.json',
						},
					},
				}),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			const out = allOutput();
			expect(out).toContain('Actor name "ab" is invalid');
			expect(out).toContain('Input schema is invalid');
			expect(out).toContain('Dataset schema "default" is invalid');
			expect(out).toContain('Dataset schema "errors" is invalid');
			expect(out).toContain('Output schema is invalid');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('all checks pass for a fully valid Actor project', async () => {
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });

			const inputRef = await copySchemaFile(validInputSchemaPath, actorDir, 'input_schema.json');
			const datasetRef = await copySchemaFile(validDatasetSchemaPath, actorDir, 'dataset-schema.json');
			const outputRef = await copySchemaFile(validOutputSchemaPath, actorDir, 'output-schema.json');
			const kvsRef = await copySchemaFile(validKvsSchemaPath, actorDir, 'kvs-schema.json');

			await writeFile(
				join(actorDir, 'actor.json'),
				JSON.stringify({
					...VALID_ACTOR_BASE,
					input: inputRef,
					output: outputRef,
					storages: {
						dataset: datasetRef,
						keyValueStore: kvsRef,
					},
				}),
			);

			await testRunCommand(ActorsDoctorCommand, {});

			const out = allOutput();
			expect(out).toContain('.actor/actor.json" is valid');
			expect(out).toContain('Actor name "my-actor" is valid');
			expect(out).toContain('Input schema is valid');
			expect(out).toContain('Dataset schema is valid');
			expect(out).toContain('Output schema is valid');
			expect(out).toContain('Key-Value Store schema is valid');
			expect(process.exitCode).not.toBe(CommandExitCodes.InvalidActorJson);
		});
	});

	// ---------------------------------------------------------------------------
	// Exit code
	// ---------------------------------------------------------------------------

	describe('exit code', () => {
		it('exits 0 for a valid project (no errors)', async () => {
			await writeActorJson(joinPath(), VALID_ACTOR_BASE);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(process.exitCode).not.toBe(CommandExitCodes.InvalidActorJson);
		});

		it('exits 0 for warnings-only (deprecated apify.json + actor.json both present)', async () => {
			await writeFile(join(joinPath(), 'apify.json'), JSON.stringify({ name: 'old-actor' }));
			await writeActorJson(joinPath(), VALID_ACTOR_BASE);

			await testRunCommand(ActorsDoctorCommand, {});

			// Warning is present but no errors → exit 0
			expect(process.exitCode).not.toBe(CommandExitCodes.InvalidActorJson);
		});

		it('exits InvalidActorJson (5) for any validation error', async () => {
			await writeActorJson(joinPath(), { ...VALID_ACTOR_BASE, output: INVALID_OUTPUT });

			await testRunCommand(ActorsDoctorCommand, {});

			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
			expect(process.exitCode).toBe(5);
		});
	});

	// ---------------------------------------------------------------------------
	// Non-object actor.json root values — crash-safety guard
	// ---------------------------------------------------------------------------

	describe('non-object actor.json root values', () => {
		it('reports schema error and exits 5 for actor.json = null — no crash', async () => {
			await writeActorJsonRaw(joinPath(), 'null');

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('schema error');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports schema error and exits 5 for actor.json = [] — no crash', async () => {
			await writeActorJsonRaw(joinPath(), '[]');

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('schema error');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports schema error and exits 5 for actor.json = "string" — no crash', async () => {
			await writeActorJsonRaw(joinPath(), '"string"');

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('schema error');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports schema error and exits 5 for actor.json = 123 — no crash', async () => {
			await writeActorJsonRaw(joinPath(), '123');

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('schema error');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('reports schema error and exits 5 for actor.json = true — no crash', async () => {
			await writeActorJsonRaw(joinPath(), 'true');

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('schema error');
			expect(process.exitCode).toBe(CommandExitCodes.InvalidActorJson);
		});

		it('does not print a raw stack trace for actor.json = null', async () => {
			await writeActorJsonRaw(joinPath(), 'null');

			await testRunCommand(ActorsDoctorCommand, {});

			// Diagnostics should be a clean message, not a raw Error stack trace
			expect(allOutput()).not.toMatch(/at \w+.*\(.*:\d+:\d+\)/);
		});
	});

	// ---------------------------------------------------------------------------
	// Terminal injection — control character sanitization
	// ---------------------------------------------------------------------------

	describe('terminal injection', () => {
		it('strips ESC sequences from actor name in diagnostic output', async () => {
			// Use JSON \\u001b so JSON.parse produces a string with ESC (0x1B).
			// A raw ESC byte in JSON text is a SyntaxError; \\u001b is the correct encoding.
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(
				join(actorDir, 'actor.json'),
				'{"actorSpecification":1,"name":"my-actor\\u001b[31mhack","version":"0.1"}',
			);

			await testRunCommand(ActorsDoctorCommand, {});

			const out = allOutput();
			// The raw ESC byte must NOT appear in the diagnostic output
			expect(out).not.toContain('\x1b');
			// The non-control text (ESC stripped, rest preserved) should be present
			expect(out).toContain('my-actor[31mhack');
		});

		it('strips NUL bytes from actor name in diagnostic output', async () => {
			// Use JSON \\u0000 so JSON.parse produces a string with NUL (0x00).
			const actorDir = join(joinPath(), '.actor');
			await mkdir(actorDir, { recursive: true });
			await writeFile(
				join(actorDir, 'actor.json'),
				'{"actorSpecification":1,"name":"my-actor\\u0000hack","version":"0.1"}',
			);

			await testRunCommand(ActorsDoctorCommand, {});

			const out = allOutput();
			// The NUL byte must NOT appear in the diagnostic output
			expect(out).not.toContain('\x00');
			// Text with NUL stripped should be present
			expect(out).toContain('my-actorhack');
		});
	});

	// ---------------------------------------------------------------------------
	// Diagnostic summary
	// ---------------------------------------------------------------------------

	describe('diagnostic summary', () => {
		it('prints "No issues found." for a valid project', async () => {
			await writeActorJson(joinPath(), VALID_ACTOR_BASE);

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('No issues found.');
		});

		it('prints "1 error" (singular) for a single error', async () => {
			// name: 'ab' passes actor.json schema but fails validateActorName → exactly 1 error
			await writeActorJson(joinPath(), { ...VALID_ACTOR_BASE, name: 'ab' });

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toContain('1 error');
			expect(allOutput()).not.toContain('1 errors');
		});

		it('prints plural "errors" count for multiple errors', async () => {
			await writeActorJson(joinPath(), {
				...VALID_ACTOR_BASE,
				output: INVALID_OUTPUT,
				storages: { keyValueStore: INVALID_KVS },
			});

			await testRunCommand(ActorsDoctorCommand, {});

			expect(allOutput()).toMatch(/\d+ errors/);
		});
	});
});
