import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { ActorGenerateSchemaTypesCommand } from '../../../../src/commands/actor/generate-schema-types.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import {
	clearAllRequired,
	makePropertiesRequired,
	prepareFieldsSchemaForCompilation,
	prepareKvsCollectionsForCompilation,
	prepareOutputSchemaForCompilation,
} from '../../../../src/lib/schema-transforms.js';
import { validDatasetSchemaPath } from '../../../__setup__/dataset-schemas/paths.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';
import {
	complexInputSchemaPath,
	defaultsInputSchemaPath,
	unparsableInputSchemaPath,
} from '../../../__setup__/input-schemas/paths.js';
import { validKvsSchemaPath } from '../../../__setup__/kvs-schemas/paths.js';
import { noPropertiesOutputSchemaPath, validOutputSchemaPath } from '../../../__setup__/output-schemas/paths.js';

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

describe('apify actor generate-schema-types', () => {
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath('generate-schema-types', {
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

		await testRunCommand(ActorGenerateSchemaTypesCommand, {
			args_path: complexInputSchemaPath,
			flags_output: outputDir,
		});

		expect(lastErrorMessage()).include('Generated types written to');

		const generatedFile = await readFile(joinPath('output', 'input.ts'), 'utf-8');
		expect(generatedFile).toContain('export interface');
		expect(generatedFile).toContain('searchQuery');
	});

	it('should use default output directory when not specified', async () => {
		await testRunCommand(ActorGenerateSchemaTypesCommand, {
			args_path: complexInputSchemaPath,
		});

		expect(lastErrorMessage()).include('Generated types written to');
		expect(lastErrorMessage()).include(join('.generated', 'actor', 'input.ts'));

		const generatedFile = await readFile(joinPath('src', '.generated', 'actor', 'input.ts'), 'utf-8');
		expect(generatedFile).toContain('export interface');
	});

	it('should generate strict types by default (no index signature)', async () => {
		const outputDir = joinPath('output-strict');

		await testRunCommand(ActorGenerateSchemaTypesCommand, {
			args_path: complexInputSchemaPath,
			flags_output: outputDir,
		});

		const generatedFile = await readFile(joinPath('output-strict', 'input.ts'), 'utf-8');
		expect(generatedFile).not.toContain('[key: string]: unknown');
	});

	it('should generate non-strict types when -s is used', async () => {
		const outputDir = joinPath('output-non-strict');

		await testRunCommand(ActorGenerateSchemaTypesCommand, {
			args_path: defaultsInputSchemaPath,
			flags_output: outputDir,
			flags_strict: false,
		});

		const generatedFile = await readFile(joinPath('output-non-strict', 'input.ts'), 'utf-8');
		// Verify the file is generated with the interface
		expect(generatedFile).toContain('export interface');
	});

	it('should fail when schema file does not exist', async () => {
		const outputDir = joinPath('output-missing');

		await testRunCommand(ActorGenerateSchemaTypesCommand, {
			args_path: '/non/existent/schema.json',
			flags_output: outputDir,
		});

		expect(lastErrorMessage()).include('Input schema has not been found');
	});

	it('should fail when schema is not valid JSON', async () => {
		const outputDir = joinPath('output-invalid');

		await testRunCommand(ActorGenerateSchemaTypesCommand, {
			args_path: unparsableInputSchemaPath,
			flags_output: outputDir,
		});

		expect(lastErrorMessage()).toBeTruthy();
	});

	it('should use custom output directory with -o flag', async () => {
		const outputDir = joinPath('custom-output');
		await testRunCommand(ActorGenerateSchemaTypesCommand, {
			args_path: defaultsInputSchemaPath,
			flags_output: outputDir,
		});

		expect(lastErrorMessage()).include('Generated types written to');
		expect(lastErrorMessage()).include('custom-output');
	});

	it('should generate required properties by default for fields without defaults', async () => {
		const outputDir = joinPath('output-required');

		await testRunCommand(ActorGenerateSchemaTypesCommand, {
			args_path: complexInputSchemaPath,
			flags_output: outputDir,
		});

		const generatedFile = await readFile(joinPath('output-required', 'input.ts'), 'utf-8');

		// startUrls has no default -> required (no ?)
		expect(generatedFile).toMatch(/startUrls:/);
		expect(generatedFile).not.toMatch(/startUrls\?:/);

		// proxyConfig has no default -> required (no ?)
		expect(generatedFile).toMatch(/proxyConfig:/);
		expect(generatedFile).not.toMatch(/proxyConfig\?:/);

		// searchQuery is in original required array but has default: "apify" -> optional (has ?)
		expect(generatedFile).toMatch(/searchQuery\?:/);

		// maxItems has default: 100 -> optional (has ?)
		expect(generatedFile).toMatch(/maxItems\?:/);

		// includeImages has default: false -> optional (has ?)
		expect(generatedFile).toMatch(/includeImages\?:/);

		// crawlerType has default: "cheerio" -> optional (has ?)
		expect(generatedFile).toMatch(/crawlerType\?:/);
	});

	it('should make all properties optional with --all-optional flag', async () => {
		const outputDir = joinPath('output-all-optional');

		await testRunCommand(ActorGenerateSchemaTypesCommand, {
			args_path: complexInputSchemaPath,
			flags_output: outputDir,
			'flags_all-optional': true,
		});

		const generatedFile = await readFile(joinPath('output-all-optional', 'input.ts'), 'utf-8');

		// With --all-optional, ALL properties should be optional - including originally required ones
		expect(generatedFile).toMatch(/startUrls\?:/);
		expect(generatedFile).toMatch(/searchQuery\?:/);
		expect(generatedFile).toMatch(/maxItems\?:/);
		expect(generatedFile).toMatch(/includeImages\?:/);
		expect(generatedFile).toMatch(/proxyConfig\?:/);

		// Nested required properties should also become optional
		expect(generatedFile).toMatch(/useApifyProxy\?:/);
		expect(generatedFile).not.toMatch(/useApifyProxy:/); // ensure it's not non-optional
	});

	describe('dataset schema', () => {
		it('should generate types from dataset schema referenced in actor.json', async () => {
			const outputDir = joinPath('ds-output');
			await setupActorConfig(joinPath(), { datasetSchemaRef: validDatasetSchemaPath });

			await testRunCommand(ActorGenerateSchemaTypesCommand, {
				flags_output: outputDir,
			});

			const generatedFile = await readFile(joinPath('ds-output', 'dataset.ts'), 'utf-8');
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

			await testRunCommand(ActorGenerateSchemaTypesCommand, {
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

			await testRunCommand(ActorGenerateSchemaTypesCommand, {
				flags_output: outputDir,
			});

			const errorMessages = logMessages.error.join('\n');
			expect(errorMessages).toContain('no fields defined');
		});

		it('should not generate dataset types when path argument is provided', async () => {
			const outputDir = joinPath('ds-output-path-arg');
			await setupActorConfig(joinPath(), { datasetSchemaRef: validDatasetSchemaPath });

			await testRunCommand(ActorGenerateSchemaTypesCommand, {
				args_path: complexInputSchemaPath,
				flags_output: outputDir,
			});

			const errorMessages = logMessages.error.join('\n');
			expect(errorMessages).not.toContain('Dataset schema');
		});
	});

	describe('output schema', () => {
		it('should generate types from output schema referenced in actor.json', async () => {
			const outputDir = joinPath('out-output');
			await setupActorConfig(joinPath(), { outputSchemaRef: validOutputSchemaPath });

			await testRunCommand(ActorGenerateSchemaTypesCommand, {
				flags_output: outputDir,
			});

			const generatedFile = await readFile(joinPath('out-output', 'output.ts'), 'utf-8');
			expect(generatedFile).toContain('export interface');
			expect(generatedFile).toContain('productPage');
			expect(generatedFile).toContain('screenshot');
			expect(generatedFile).toContain('report');
			// template fields should be stripped
			expect(generatedFile).not.toContain('template');
			expect(generatedFile).not.toContain('{{');
		});

		it('should generate types from output schema embedded in actor.json', async () => {
			const outputDir = joinPath('out-output-embedded');
			await setupActorConfig(joinPath(), {
				outputSchemaRef: {
					actorOutputSchemaVersion: 1,
					properties: {
						resultPage: { type: 'string', template: 'https://example.com/{{id}}' },
						dataExport: { type: 'string', template: 'https://example.com/export/{{id}}' },
					},
					required: ['resultPage'],
				},
			});

			await testRunCommand(ActorGenerateSchemaTypesCommand, {
				flags_output: outputDir,
			});

			const generatedFile = await readFile(joinPath('out-output-embedded', 'output.ts'), 'utf-8');
			expect(generatedFile).toContain('export interface');
			expect(generatedFile).toContain('resultPage');
			expect(generatedFile).toContain('dataExport');
		});

		it('should skip when output schema has no properties', async () => {
			const outputDir = joinPath('out-output-empty');
			await setupActorConfig(joinPath(), { outputSchemaRef: noPropertiesOutputSchemaPath });

			await testRunCommand(ActorGenerateSchemaTypesCommand, {
				flags_output: outputDir,
			});

			const errorMessages = logMessages.error.join('\n');
			expect(errorMessages).toContain('no properties defined');
		});

		it('should not generate output types when path argument is provided', async () => {
			const outputDir = joinPath('out-output-path-arg');
			await setupActorConfig(joinPath(), { outputSchemaRef: validOutputSchemaPath });

			await testRunCommand(ActorGenerateSchemaTypesCommand, {
				args_path: complexInputSchemaPath,
				flags_output: outputDir,
			});

			const errorMessages = logMessages.error.join('\n');
			expect(errorMessages).not.toContain('Output schema');
		});
	});

	describe('key-value store schema', () => {
		it('should generate types from KVS schema referenced in actor.json', async () => {
			const outputDir = joinPath('kvs-output');
			await setupActorConfig(joinPath(), { kvsSchemaRef: validKvsSchemaPath });

			await testRunCommand(ActorGenerateSchemaTypesCommand, {
				flags_output: outputDir,
			});

			const generatedFile = await readFile(joinPath('kvs-output', 'key-value-store.ts'), 'utf-8');
			expect(generatedFile).toContain('export interface');
			// Only "results" collection has jsonSchema; "screenshots" does not
			expect(generatedFile).toContain('totalItems');
			expect(generatedFile).toContain('summary');
		});

		it('should generate types from KVS schema embedded in actor.json', async () => {
			const outputDir = joinPath('kvs-output-embedded');
			await setupActorConfig(joinPath(), {
				kvsSchemaRef: {
					actorKeyValueStoreSchemaVersion: 1,
					title: 'Test KVS',
					collections: {
						metrics: {
							title: 'Metrics',
							contentTypes: ['application/json'],
							key: 'METRICS',
							jsonSchema: {
								type: 'object',
								properties: {
									runCount: { type: 'integer' },
									avgDuration: { type: 'number' },
								},
								required: ['runCount'],
							},
						},
					},
				},
			});

			await testRunCommand(ActorGenerateSchemaTypesCommand, {
				flags_output: outputDir,
			});

			const generatedFile = await readFile(joinPath('kvs-output-embedded', 'key-value-store.ts'), 'utf-8');
			expect(generatedFile).toContain('export interface');
			expect(generatedFile).toContain('runCount');
			expect(generatedFile).toContain('avgDuration');
		});

		it('should skip when no collections have jsonSchema', async () => {
			const outputDir = joinPath('kvs-output-no-json');
			await setupActorConfig(joinPath(), {
				kvsSchemaRef: {
					actorKeyValueStoreSchemaVersion: 1,
					title: 'Image KVS',
					collections: {
						images: {
							title: 'Images',
							contentTypes: ['image/png'],
							keyPrefix: 'img-',
						},
					},
				},
			});

			await testRunCommand(ActorGenerateSchemaTypesCommand, {
				flags_output: outputDir,
			});

			const errorMessages = logMessages.error.join('\n');
			expect(errorMessages).toContain('no collections with JSON schemas');
		});

		it('should not generate KVS types when path argument is provided', async () => {
			const outputDir = joinPath('kvs-output-path-arg');
			await setupActorConfig(joinPath(), { kvsSchemaRef: validKvsSchemaPath });

			await testRunCommand(ActorGenerateSchemaTypesCommand, {
				args_path: complexInputSchemaPath,
				flags_output: outputDir,
			});

			const errorMessages = logMessages.error.join('\n');
			expect(errorMessages).not.toContain('Key-Value Store schema');
		});
	});
});

describe('prepareFieldsSchemaForCompilation', () => {
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

		const result = prepareFieldsSchemaForCompilation(schema);
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

		const result = prepareFieldsSchemaForCompilation(schema);
		expect(result).not.toBeNull();
		expect(result!.type).toBe('object');
	});

	it('should return null for empty fields', () => {
		const schema = {
			actorSpecification: 1,
			fields: {},
			views: {},
		};

		const result = prepareFieldsSchemaForCompilation(schema);
		expect(result).toBeNull();
	});

	it('should return null when fields key is missing', () => {
		const schema = {
			actorSpecification: 1,
			views: {},
		};

		const result = prepareFieldsSchemaForCompilation(schema);
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

		prepareFieldsSchemaForCompilation(schema);
		expect((schema.fields as any).type).toBeUndefined();
	});
});

describe('prepareOutputSchemaForCompilation', () => {
	it('should extract properties and strip template fields', () => {
		const schema = {
			actorOutputSchemaVersion: 1,
			properties: {
				page: { type: 'string', template: 'https://example.com/{{id}}', title: 'Page' },
				report: { type: 'string', template: 'https://example.com/report/{{id}}' },
			},
			required: ['page'],
		};

		const result = prepareOutputSchemaForCompilation(schema);
		expect(result).toEqual({
			type: 'object',
			properties: {
				page: { type: 'string', title: 'Page' },
				report: { type: 'string' },
			},
			required: ['page'],
		});
	});

	it('should return null when properties are missing', () => {
		const schema = {
			actorOutputSchemaVersion: 1,
		};

		const result = prepareOutputSchemaForCompilation(schema);
		expect(result).toBeNull();
	});

	it('should return null when properties are empty', () => {
		const schema = {
			actorOutputSchemaVersion: 1,
			properties: {},
		};

		const result = prepareOutputSchemaForCompilation(schema);
		expect(result).toBeNull();
	});

	it('should not include non-JSON-Schema keys like actorOutputSchemaVersion', () => {
		const schema = {
			actorOutputSchemaVersion: 1,
			properties: {
				name: { type: 'string', template: 'https://example.com/{{name}}' },
			},
		};

		const result = prepareOutputSchemaForCompilation(schema);
		expect(result).not.toBeNull();
		expect(result).not.toHaveProperty('actorOutputSchemaVersion');
	});

	it('should not mutate the original schema', () => {
		const schema = {
			actorOutputSchemaVersion: 1,
			properties: {
				name: { type: 'string', template: 'https://example.com/{{name}}' },
			},
		};

		prepareOutputSchemaForCompilation(schema);
		expect(schema).toHaveProperty('actorOutputSchemaVersion');
		expect((schema.properties as any).name).toHaveProperty('template');
	});
});

describe('prepareKvsCollectionsForCompilation', () => {
	it('should extract jsonSchema from collections', () => {
		const schema = {
			actorKeyValueStoreSchemaVersion: 1,
			title: 'Test',
			collections: {
				results: {
					contentTypes: ['application/json'],
					key: 'RESULTS',
					jsonSchema: {
						type: 'object',
						properties: { count: { type: 'integer' } },
					},
				},
			},
		};

		const result = prepareKvsCollectionsForCompilation(schema);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('results');
		expect(result[0].schema).toEqual({
			type: 'object',
			properties: { count: { type: 'integer' } },
		});
	});

	it('should skip collections without jsonSchema', () => {
		const schema = {
			actorKeyValueStoreSchemaVersion: 1,
			title: 'Test',
			collections: {
				images: {
					contentTypes: ['image/png'],
					keyPrefix: 'img-',
				},
				results: {
					contentTypes: ['application/json'],
					key: 'RESULTS',
					jsonSchema: {
						type: 'object',
						properties: { count: { type: 'integer' } },
					},
				},
			},
		};

		const result = prepareKvsCollectionsForCompilation(schema);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('results');
	});

	it('should return empty array when no collections exist', () => {
		const schema = {
			actorKeyValueStoreSchemaVersion: 1,
			title: 'Test',
		};

		const result = prepareKvsCollectionsForCompilation(schema);
		expect(result).toEqual([]);
	});

	it('should return empty array when no collections have jsonSchema', () => {
		const schema = {
			actorKeyValueStoreSchemaVersion: 1,
			title: 'Test',
			collections: {
				images: {
					contentTypes: ['image/png'],
					keyPrefix: 'img-',
				},
			},
		};

		const result = prepareKvsCollectionsForCompilation(schema);
		expect(result).toEqual([]);
	});

	it('should inject type: "object" when missing from jsonSchema', () => {
		const schema = {
			actorKeyValueStoreSchemaVersion: 1,
			title: 'Test',
			collections: {
				data: {
					contentTypes: ['application/json'],
					key: 'DATA',
					jsonSchema: {
						properties: { name: { type: 'string' } },
					},
				},
			},
		};

		const result = prepareKvsCollectionsForCompilation(schema);
		expect(result).toHaveLength(1);
		expect(result[0].schema.type).toBe('object');
	});

	it('should not mutate the original schema', () => {
		const schema = {
			actorKeyValueStoreSchemaVersion: 1,
			title: 'Test',
			collections: {
				data: {
					contentTypes: ['application/json'],
					key: 'DATA',
					jsonSchema: {
						properties: { name: { type: 'string' } },
					},
				},
			},
		};

		prepareKvsCollectionsForCompilation(schema);
		expect((schema.collections as any).data.jsonSchema.type).toBeUndefined();
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

	it('should remove existing required entries that have defaults', () => {
		const schema = {
			type: 'object',
			properties: {
				name: { type: 'string' },
				age: { type: 'number', default: 25 },
			},
			required: ['age'],
		};

		const result = makePropertiesRequired(schema);
		expect(result.required).toContain('name');
		expect(result.required).not.toContain('age');
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

describe('clearAllRequired', () => {
	it('should remove top-level required array', () => {
		const schema = {
			type: 'object',
			properties: {
				name: { type: 'string' },
			},
			required: ['name'],
		};

		const result = clearAllRequired(schema);
		expect(result.required).toBeUndefined();
	});

	it('should remove required arrays from nested objects', () => {
		const schema = {
			type: 'object',
			properties: {
				nested: {
					type: 'object',
					properties: {
						inner: { type: 'string' },
					},
					required: ['inner'],
				},
			},
			required: ['nested'],
		};

		const result = clearAllRequired(schema);
		expect(result.required).toBeUndefined();
		const { nested } = result.properties as any;
		expect(nested.required).toBeUndefined();
	});

	it('should not mutate the original schema', () => {
		const schema = {
			type: 'object',
			properties: {
				name: { type: 'string' },
			},
			required: ['name'],
		};

		clearAllRequired(schema);
		expect(schema.required).toEqual(['name']);
	});

	it('should handle schema with no properties', () => {
		const schema = { type: 'object', required: ['foo'] };
		const result = clearAllRequired(schema);
		expect(result.required).toBeUndefined();
	});
});
