import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ActorGenerateTypesCommand, makePropertiesRequired } from '../../../../src/commands/actor/generate-types.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';
import {
	complexInputSchemaPath,
	defaultsInputSchemaPath,
	unparsableInputSchemaPath,
} from '../../../__setup__/input-schemas/paths.js';

const { lastErrorMessage } = useConsoleSpy();

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
		const {nested} = (result.properties as any);
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
