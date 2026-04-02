import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { ValidateSchemaCommand } from '../../../src/commands/validate-schema.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { validDatasetSchemaPath } from '../../__setup__/dataset-schemas/paths.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';
import {
	invalidInputSchemaPath,
	unparsableInputSchemaPath,
	validInputSchemaPath,
} from '../../__setup__/input-schemas/paths.js';
import { validKvsSchemaPath } from '../../__setup__/kvs-schemas/paths.js';
import { validOutputSchemaPath } from '../../__setup__/output-schemas/paths.js';

const { lastErrorMessage, logMessages } = useConsoleSpy();

async function setupActorConfig(
	basePath: string,
	{
		inputSchema,
		datasetSchemaRef,
		outputSchemaRef,
		kvsSchemaRef,
	}: {
		inputSchema?: Record<string, unknown>;
		datasetSchemaRef?: string | Record<string, unknown>;
		outputSchemaRef?: string | Record<string, unknown>;
		kvsSchemaRef?: string | Record<string, unknown>;
	},
) {
	const actorDir = join(basePath, '.actor');
	await mkdir(actorDir, { recursive: true });

	const minimalInput = inputSchema ?? {
		title: 'Test',
		type: 'object',
		schemaVersion: 1,
		properties: {
			foo: { title: 'Foo', description: 'A foo field', type: 'string', default: 'bar', editor: 'textfield' },
		},
	};

	await writeFile(join(actorDir, 'input_schema.json'), JSON.stringify(minimalInput, null, '\t'));

	const actorJson: Record<string, unknown> = {
		actorSpecification: 1,
		name: 'test-actor',
		version: '0.1',
		input: './input_schema.json',
	};

	const storages: Record<string, unknown> = {};

	if (datasetSchemaRef !== undefined) {
		if (typeof datasetSchemaRef === 'string') {
			const content = await readFile(datasetSchemaRef, 'utf-8');
			const fileName = basename(datasetSchemaRef);
			await writeFile(join(actorDir, fileName), content);
			storages.dataset = `./${fileName}`;
		} else {
			storages.dataset = datasetSchemaRef;
		}
	}

	if (kvsSchemaRef !== undefined) {
		if (typeof kvsSchemaRef === 'string') {
			const content = await readFile(kvsSchemaRef, 'utf-8');
			const fileName = `kvs-${basename(kvsSchemaRef)}`;
			await writeFile(join(actorDir, fileName), content);
			storages.keyValueStore = `./${fileName}`;
		} else {
			storages.keyValueStore = kvsSchemaRef;
		}
	}

	if (Object.keys(storages).length > 0) {
		actorJson.storages = storages;
	}

	if (outputSchemaRef !== undefined) {
		if (typeof outputSchemaRef === 'string') {
			const content = await readFile(outputSchemaRef, 'utf-8');
			const fileName = `output-${basename(outputSchemaRef)}`;
			await writeFile(join(actorDir, fileName), content);
			actorJson.output = `./${fileName}`;
		} else {
			actorJson.output = outputSchemaRef;
		}
	}

	await writeFile(join(actorDir, 'actor.json'), JSON.stringify(actorJson, null, '\t'));
}

describe('apify validate-schema', () => {
	describe('with path argument (backward compat)', () => {
		it('should correctly validate schema 1', async () => {
			await testRunCommand(ValidateSchemaCommand, {
				args_path: validInputSchemaPath,
			});

			expect(lastErrorMessage()).toMatch(/is valid/);
		});

		it('should correctly validate schema 2', async () => {
			await testRunCommand(ValidateSchemaCommand, {
				args_path: invalidInputSchemaPath,
			});

			expect(lastErrorMessage()).to.contain(
				'Field schema.properties.queries.editor must be equal to one of the allowed values',
			);
		});

		it('should correctly validate schema 3', async () => {
			await testRunCommand(ValidateSchemaCommand, {
				args_path: unparsableInputSchemaPath,
			});

			expect(lastErrorMessage()).to.contain.oneOf([
				'Unexpected token }',
				"Expected ',' or ']' after array element",
			]);
		});
	});

	describe('without path argument (all schemas)', () => {
		const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath('validate-schema', {
			create: true,
			remove: true,
			cwd: true,
			cwdParent: false,
		});

		beforeEach(async () => {
			await beforeAllCalls();
		});

		afterEach(async () => {
			await afterAllCalls();
		});

		it('should validate all schemas when no path is provided', async () => {
			await setupActorConfig(joinPath(), {
				datasetSchemaRef: validDatasetSchemaPath,
				outputSchemaRef: validOutputSchemaPath,
				kvsSchemaRef: validKvsSchemaPath,
			});

			await testRunCommand(ValidateSchemaCommand, {});

			const allMessages = logMessages.error.join('\n');
			expect(allMessages).toContain('Input schema is valid');
			expect(allMessages).toContain('Dataset schema is valid');
			expect(allMessages).toContain('Output schema is valid');
			expect(allMessages).toContain('Key-Value Store schema is valid');
		});

		it('should skip schemas not defined in actor.json', async () => {
			await setupActorConfig(joinPath(), {});

			await testRunCommand(ValidateSchemaCommand, {});

			const allMessages = logMessages.error.join('\n');
			expect(allMessages).toContain('Input schema is valid');
			expect(allMessages).not.toContain('Dataset');
			expect(allMessages).not.toContain('Output');
			expect(allMessages).not.toContain('Key-Value Store');
		});

		it('should report error for invalid dataset schema', async () => {
			await setupActorConfig(joinPath(), {
				datasetSchemaRef: {
					// missing actorSpecification — invalid
					fields: {},
					views: {},
				},
			});

			await testRunCommand(ValidateSchemaCommand, {});

			const allMessages = logMessages.error.join('\n');
			expect(allMessages).toContain('Input schema is valid');
			expect(allMessages).toContain('Dataset schema is not valid');
		});

		it('should report error for invalid output schema', async () => {
			await setupActorConfig(joinPath(), {
				outputSchemaRef: {
					// missing actorOutputSchemaVersion — invalid
					properties: {},
				},
			});

			await testRunCommand(ValidateSchemaCommand, {});

			const allMessages = logMessages.error.join('\n');
			expect(allMessages).toContain('Input schema is valid');
			expect(allMessages).toContain('Output schema is not valid');
		});

		it('should report error for invalid KVS schema', async () => {
			await setupActorConfig(joinPath(), {
				kvsSchemaRef: {
					// missing actorKeyValueStoreSchemaVersion — invalid
					collections: {},
				},
			});

			await testRunCommand(ValidateSchemaCommand, {});

			const allMessages = logMessages.error.join('\n');
			expect(allMessages).toContain('Input schema is valid');
			expect(allMessages).toContain('Key-Value Store schema is not valid');
		});

		it('should only validate input schema when path arg is provided', async () => {
			await setupActorConfig(joinPath(), {
				datasetSchemaRef: validDatasetSchemaPath,
				outputSchemaRef: validOutputSchemaPath,
				kvsSchemaRef: validKvsSchemaPath,
			});

			await testRunCommand(ValidateSchemaCommand, {
				args_path: validInputSchemaPath,
			});

			const allMessages = logMessages.error.join('\n');
			expect(allMessages).toContain('Input schema is valid');
			expect(allMessages).not.toContain('Dataset');
			expect(allMessages).not.toContain('Output');
			expect(allMessages).not.toContain('Key-Value Store');
		});

		it('should continue validating remaining schemas when one fails', async () => {
			await setupActorConfig(joinPath(), {
				datasetSchemaRef: {
					// invalid dataset schema
					fields: {},
					views: {},
				},
				outputSchemaRef: validOutputSchemaPath,
				kvsSchemaRef: validKvsSchemaPath,
			});

			await testRunCommand(ValidateSchemaCommand, {});

			const allMessages = logMessages.error.join('\n');
			expect(allMessages).toContain('Input schema is valid');
			expect(allMessages).toContain('Dataset schema is not valid');
			expect(allMessages).toContain('Output schema is valid');
			expect(allMessages).toContain('Key-Value Store schema is valid');
		});
	});
});
