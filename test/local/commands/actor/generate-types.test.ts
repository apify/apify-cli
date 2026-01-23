import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ActorGenerateTypesCommand } from '../../../../src/commands/actor/generate-types.js';
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

		const generatedFile = await readFile(joinPath('.generated', 'actor', 'complex.ts'), 'utf-8');
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
});
