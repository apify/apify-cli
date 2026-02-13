import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	ActorGenerateTypesCommand,
	makePropertiesRequired,
	prepareDatasetSchemaForCompilation,
} from '../../../../src/commands/actor/generate-types.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { noFieldsDatasetSchemaPath, validDatasetSchemaPath } from '../../../__setup__/dataset-schemas/paths.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';
import {
	complexInputSchemaPath,
	defaultsInputSchemaPath,
	unparsableInputSchemaPath,
} from '../../../__setup__/input-schemas/paths.js';

const { lastErrorMessage, logMessages } = useConsoleSpy();

async function setupActorConfig(
	basePath: string,
	{
		inputSchema,
		datasetSchemaRef,
	}: {
		inputSchema?: Record<string, unknown>;
		datasetSchemaRef?: string | Record<string, unknown>;
	},
) {
	const actorDir = join(basePath, '.actor');
	await mkdir(actorDir, { recursive: true });

	// Always provide a minimal input schema so the command doesn't fail
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

	if (datasetSchemaRef !== undefined) {
		if (typeof datasetSchemaRef === 'string') {
			// Copy the dataset schema file into the .actor dir
			const content = await readFile(datasetSchemaRef, 'utf-8');
			const fileName = datasetSchemaRef.split('/').pop()!;
			await writeFile(join(actorDir, fileName), content);
			actorJson.storages = { dataset: `./${fileName}` };
		} else {
			actorJson.storages = { dataset: datasetSchemaRef };
		}
	}

	await writeFile(join(actorDir, 'actor.json'), JSON.stringify(actorJson, null, '\t'));
}

describe('apify actor generate-types', () => {
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath('generate-types', {
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

	it('should generate types from a valid schema', async () => {
		const outputDir = joinPath('output');

		await testRunCommand(ActorGenerateTypesCommand, {
			args_path: complexInputSchemaPath,
			flags_output: outputDir,
		});

		expect(lastErrorMessage()).include('Generated types written to');

		const generatedFile = await readFile(joinPath('output', 'complex.ts'), 'utf-8');
		expect(generatedFile).toContain('export interface');
		expect(generatedFile).toContain('searchQuery');
	});

	it('should use default output directory when not specified', async () => {
		await testRunCommand(ActorGenerateTypesCommand, {
			args_path: complexInputSchemaPath,
		});

		expect(lastErrorMessage()).include('Generated types written to');
		expect(lastErrorMessage()).include(join('.generated', 'actor', 'complex.ts'));

		const generatedFile = await readFile(joinPath('src', '.generated', 'actor', 'complex.ts'), 'utf-8');
		expect(generatedFile).toContain('export interface');
	});

	it('should generate strict types by default (no index signature)', async () => {
		const outputDir = joinPath('output-strict');

		await testRunCommand(ActorGenerateTypesCommand, {
			args_path: complexInputSchemaPath,
			flags_output: outputDir,
		});

		const generatedFile = await readFile(joinPath('output-strict', 'complex.ts'), 'utf-8');
		expect(generatedFile).not.toContain('[key: string]: unknown');
	});

	it('should generate non-strict types when -s is used', async () => {
		const outputDir = joinPath('output-non-strict');

		await testRunCommand(ActorGenerateTypesCommand, {
			args_path: defaultsInputSchemaPath,
			flags_output: outputDir,
			flags_strict: false,
		});

		const generatedFile = await readFile(joinPath('output-non-strict', 'defaults.ts'), 'utf-8');
		// Verify the file is generated with the interface
		expect(generatedFile).toContain('export interface Defaults');
	});

	it('should fail when schema file does not exist', async () => {
		const outputDir = joinPath('output-missing');

		await testRunCommand(ActorGenerateTypesCommand, {
			args_path: '/non/existent/schema.json',
			flags_output: outputDir,
		});

		expect(lastErrorMessage()).include('Input schema has not been found');
	});

	it('should fail when schema is not valid JSON', async () => {
		const outputDir = joinPath('output-invalid');

		await testRunCommand(ActorGenerateTypesCommand, {
			args_path: unparsableInputSchemaPath,
			flags_output: outputDir,
		});

		expect(lastErrorMessage()).toBeTruthy();
	});

	it('should use custom output directory with -o flag', async () => {
		const outputDir = joinPath('custom-output');
		await testRunCommand(ActorGenerateTypesCommand, {
			args_path: defaultsInputSchemaPath,
			flags_output: outputDir,
		});

		expect(lastErrorMessage()).include('Generated types written to');
		expect(lastErrorMessage()).include('custom-output');
	});

	it('should generate required properties by default for fields without defaults', async () => {
		const outputDir = joinPath('output-required');

		await testRunCommand(ActorGenerateTypesCommand, {
			args_path: complexInputSchemaPath,
			flags_output: outputDir,
		});

		const generatedFile = await readFile(joinPath('output-required', 'complex.ts'), 'utf-8');

		// startUrls has no default -> required (no ?)
		expect(generatedFile).toMatch(/startUrls:/);
		expect(generatedFile).not.toMatch(/startUrls\?:/);

		// proxyConfig has no default -> required (no ?)
		expect(generatedFile).toMatch(/proxyConfig:/);
		expect(generatedFile).not.toMatch(/proxyConfig\?:/);

		// maxItems has default: 100 -> optional (has ?)
		expect(generatedFile).toMatch(/maxItems\?:/);

		// includeImages has default: false -> optional (has ?)
		expect(generatedFile).toMatch(/includeImages\?:/);

		// crawlerType has default: "cheerio" -> optional (has ?)
		expect(generatedFile).toMatch(/crawlerType\?:/);
	});

	it('should make all properties optional with --all-optional flag', async () => {
		const outputDir = joinPath('output-all-optional');

		await testRunCommand(ActorGenerateTypesCommand, {
			args_path: complexInputSchemaPath,
			flags_output: outputDir,
			'flags_all-optional': true,
		});

		const generatedFile = await readFile(joinPath('output-all-optional', 'complex.ts'), 'utf-8');

		// With --all-optional, properties not in the original required array should be optional
		expect(generatedFile).toMatch(/maxItems\?:/);
		expect(generatedFile).toMatch(/includeImages\?:/);
		expect(generatedFile).toMatch(/proxyConfig\?:/);
	});

	describe('dataset schema', () => {
		it('should generate types from dataset schema referenced in actor.json', async () => {
			const outputDir = joinPath('ds-output');
			await setupActorConfig(joinPath(), { datasetSchemaRef: validDatasetSchemaPath });

			await testRunCommand(ActorGenerateTypesCommand, {
				flags_output: outputDir,
			});

			const generatedFile = await readFile(joinPath('ds-output', 'valid.ts'), 'utf-8');
			expect(generatedFile).toContain('export interface');
			expect(generatedFile).toContain('title');
			expect(generatedFile).toContain('url');
			expect(generatedFile).toContain('price');
		});

		it('should generate types from dataset schema embedded in actor.json', async () => {
			const outputDir = joinPath('ds-output-embedded');
			await setupActorConfig(joinPath(), {
				datasetSchemaRef: {
					actorSpecification: 1,
					fields: {
						type: 'object',
						properties: {
							name: { type: 'string' },
							value: { type: 'integer' },
						},
						required: ['name'],
					},
					views: {},
				},
			});

			await testRunCommand(ActorGenerateTypesCommand, {
				flags_output: outputDir,
			});

			const generatedFile = await readFile(joinPath('ds-output-embedded', 'dataset.ts'), 'utf-8');
			expect(generatedFile).toContain('export interface');
			expect(generatedFile).toContain('name');
			expect(generatedFile).toContain('value');
		});

		it('should skip when dataset fields are empty', async () => {
			const outputDir = joinPath('ds-output-empty');
			await setupActorConfig(joinPath(), {
				datasetSchemaRef: {
					actorSpecification: 1,
					fields: {},
					views: {},
				},
			});

			await testRunCommand(ActorGenerateTypesCommand, {
				flags_output: outputDir,
			});

			const errorMessages = logMessages.error.join('\n');
			expect(errorMessages).toContain('no fields defined');
		});

		it('should skip when storages.dataset is not defined in actor.json', async () => {
			const outputDir = joinPath('ds-output-no-dataset');
			await setupActorConfig(joinPath(), {});

			await testRunCommand(ActorGenerateTypesCommand, {
				flags_output: outputDir,
			});

			// Should succeed for input schema without mentioning dataset schema generation
			const errorMessages = logMessages.error.join('\n');
			expect(errorMessages).toContain('Generated types written to');
			expect(errorMessages).not.toContain('dataset schema');
		});

		it('should respect required array from dataset fields as-is', async () => {
			const outputDir = joinPath('ds-output-required');
			await setupActorConfig(joinPath(), { datasetSchemaRef: validDatasetSchemaPath });

			await testRunCommand(ActorGenerateTypesCommand, {
				flags_output: outputDir,
			});

			const generatedFile = await readFile(joinPath('ds-output-required', 'valid.ts'), 'utf-8');

			// title and url are in required -> no ?
			expect(generatedFile).toMatch(/title:/);
			expect(generatedFile).not.toMatch(/title\?:/);
			expect(generatedFile).toMatch(/url:/);
			expect(generatedFile).not.toMatch(/url\?:/);

			// price is NOT in required -> has ?
			expect(generatedFile).toMatch(/price\?:/);
		});

		it('should make all dataset properties optional with --all-optional', async () => {
			const outputDir = joinPath('ds-output-all-optional');
			await setupActorConfig(joinPath(), { datasetSchemaRef: validDatasetSchemaPath });

			await testRunCommand(ActorGenerateTypesCommand, {
				flags_output: outputDir,
				'flags_all-optional': true,
			});

			const generatedFile = await readFile(joinPath('ds-output-all-optional', 'valid.ts'), 'utf-8');

			expect(generatedFile).toMatch(/title\?:/);
			expect(generatedFile).toMatch(/url\?:/);
			expect(generatedFile).toMatch(/price\?:/);
		});

		it('should generate strict dataset types by default (no index signature)', async () => {
			const outputDir = joinPath('ds-output-strict');
			await setupActorConfig(joinPath(), { datasetSchemaRef: validDatasetSchemaPath });

			await testRunCommand(ActorGenerateTypesCommand, {
				flags_output: outputDir,
			});

			const generatedFile = await readFile(joinPath('ds-output-strict', 'valid.ts'), 'utf-8');
			expect(generatedFile).not.toContain('[k: string]: unknown');
		});

		it('should not generate dataset types when path argument is provided', async () => {
			const outputDir = joinPath('ds-output-path-arg');
			await setupActorConfig(joinPath(), { datasetSchemaRef: validDatasetSchemaPath });

			await testRunCommand(ActorGenerateTypesCommand, {
				args_path: complexInputSchemaPath,
				flags_output: outputDir,
			});

			// Only input schema types should be generated
			const errorMessages = logMessages.error.join('\n');
			expect(errorMessages).not.toContain('dataset schema');
		});

		it('should skip when fields key is missing from dataset schema', async () => {
			const outputDir = joinPath('ds-output-no-fields');
			await setupActorConfig(joinPath(), { datasetSchemaRef: noFieldsDatasetSchemaPath });

			await testRunCommand(ActorGenerateTypesCommand, {
				flags_output: outputDir,
			});

			const errorMessages = logMessages.error.join('\n');
			expect(errorMessages).toContain('no fields defined');
		});

		it('should add index signature when additionalProperties is enabled on dataset schema', async () => {
			const { readFileSync } = await import('node:fs');
			const { compile: compileSchema } = await import('json-schema-to-typescript');

			const rawSchema = JSON.parse(readFileSync(validDatasetSchemaPath, 'utf-8'));
			const prepared = prepareDatasetSchemaForCompilation(rawSchema);
			expect(prepared).not.toBeNull();

			const result = await compileSchema(prepared!, 'valid', {
				bannerComment: '',
				additionalProperties: true, // --strict=false
			});

			expect(result).toContain('[k: string]: unknown');
		});

		it('should not include views content in generated types', async () => {
			const outputDir = joinPath('ds-output-no-views');
			await setupActorConfig(joinPath(), { datasetSchemaRef: validDatasetSchemaPath });

			await testRunCommand(ActorGenerateTypesCommand, {
				flags_output: outputDir,
			});

			const generatedFile = await readFile(joinPath('ds-output-no-views', 'valid.ts'), 'utf-8');
			expect(generatedFile).not.toContain('Overview');
			expect(generatedFile).not.toContain('transformation');
			expect(generatedFile).not.toContain('component');
			expect(generatedFile).not.toContain('display');
		});
	});
});

describe('prepareDatasetSchemaForCompilation', () => {
	it('should extract fields sub-schema', () => {
		const schema = {
			actorSpecification: 1,
			fields: {
				type: 'object',
				properties: {
					title: { type: 'string' },
				},
				required: ['title'],
			},
			views: {},
		};

		const result = prepareDatasetSchemaForCompilation(schema);
		expect(result).toEqual({
			type: 'object',
			properties: { title: { type: 'string' } },
			required: ['title'],
		});
	});

	it('should inject type: "object" when missing from fields', () => {
		const schema = {
			actorSpecification: 1,
			fields: {
				properties: {
					name: { type: 'string' },
				},
			},
			views: {},
		};

		const result = prepareDatasetSchemaForCompilation(schema);
		expect(result).not.toBeNull();
		expect(result!.type).toBe('object');
	});

	it('should return null for empty fields', () => {
		const schema = {
			actorSpecification: 1,
			fields: {},
			views: {},
		};

		const result = prepareDatasetSchemaForCompilation(schema);
		expect(result).toBeNull();
	});

	it('should return null when fields key is missing', () => {
		const schema = {
			actorSpecification: 1,
			views: {},
		};

		const result = prepareDatasetSchemaForCompilation(schema);
		expect(result).toBeNull();
	});

	it('should not mutate the original schema', () => {
		const schema = {
			actorSpecification: 1,
			fields: {
				properties: {
					title: { type: 'string' },
				},
			},
			views: {},
		};

		prepareDatasetSchemaForCompilation(schema);
		expect((schema.fields as any).type).toBeUndefined();
	});
});

describe('makePropertiesRequired', () => {
	it('should add properties without defaults to required array', () => {
		const schema = {
			type: 'object',
			properties: {
				name: { type: 'string' },
				age: { type: 'number', default: 25 },
			},
		};

		const result = makePropertiesRequired(schema);
		expect(result.required).toEqual(['name']);
	});

	it('should preserve existing required entries', () => {
		const schema = {
			type: 'object',
			properties: {
				name: { type: 'string' },
				age: { type: 'number', default: 25 },
			},
			required: ['age'],
		};

		const result = makePropertiesRequired(schema);
		expect(result.required).toContain('age');
		expect(result.required).toContain('name');
	});

	it('should recurse into nested object properties', () => {
		const schema = {
			type: 'object',
			properties: {
				nested: {
					type: 'object',
					properties: {
						innerRequired: { type: 'string' },
						innerOptional: { type: 'string', default: 'hello' },
					},
				},
			},
		};

		const result = makePropertiesRequired(schema);
		const { nested } = result.properties as any;
		expect(nested.required).toEqual(['innerRequired']);
	});

	it('should not mutate the original schema', () => {
		const schema = {
			type: 'object',
			properties: {
				name: { type: 'string' },
			},
			required: [] as string[],
		};

		makePropertiesRequired(schema);
		expect(schema.required).toEqual([]);
	});

	it('should return schema unchanged when there are no properties', () => {
		const schema = { type: 'object' };
		const result = makePropertiesRequired(schema);
		expect(result).toEqual({ type: 'object' });
	});
});
