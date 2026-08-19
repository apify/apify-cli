import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

import { getInputOverride, resolveInput } from '../../../src/lib/commands/resolve-input.js';
import { CommandExitCodes } from '../../../src/lib/consts.js';
import { getLocalKeyValueStorePath } from '../../../src/lib/utils.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

const SCHEMA_HINT = 'Run "apify actors info apify/hello-world --input" to inspect the Actor input schema.';

const { logMessages } = useConsoleSpy();
const tempDirs: string[] = [];

describe('getInputOverride', () => {
	afterEach(async () => {
		process.exitCode = undefined;

		await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
	});

	it('does not append schema hint to --input file path errors', async () => {
		const result = await getInputOverride(process.cwd(), './input.json', undefined, { schemaHint: SCHEMA_HINT });

		expect(result).toBe(false);
		expect(process.exitCode).toBe(CommandExitCodes.InvalidInput);
		const stderr = logMessages.error.join('\n');
		expect(stderr).toContain('Use the "--input-file=" flag instead');
		expect(stderr).not.toContain(SCHEMA_HINT);
	});

	it('keeps --input file path errors unchanged when schema hint is omitted', async () => {
		const result = await getInputOverride(process.cwd(), './input.json', undefined);

		expect(result).toBe(false);
		expect(process.exitCode).toBe(CommandExitCodes.InvalidInput);
		expect(logMessages.error.join('\n')).not.toContain('apify actors info');
	});

	it('appends schema hint to malformed inline JSON errors', async () => {
		const result = await getInputOverride(process.cwd(), '{"url":', undefined, { schemaHint: SCHEMA_HINT });

		expect(result).toBe(false);
		expect(process.exitCode).toBe(CommandExitCodes.InvalidInput);
		const stderr = logMessages.error.join('\n');
		expect(stderr).toContain('Cannot parse JSON input.');
		expect(stderr).toContain(SCHEMA_HINT);
	});

	it('appends schema hint to array input errors', async () => {
		const result = await getInputOverride(process.cwd(), '[]', undefined, { schemaHint: SCHEMA_HINT });

		expect(result).toBe(false);
		expect(process.exitCode).toBe(CommandExitCodes.InvalidInput);
		const stderr = logMessages.error.join('\n');
		expect(stderr).toContain('It should be an object, not an array.');
		expect(stderr).toContain(SCHEMA_HINT);
	});

	it('includes the file path when --input-file contains malformed JSON', async () => {
		const tempDir = await mkdtemp(join(tmpdir(), 'apify-cli-input-'));
		tempDirs.push(tempDir);
		const inputPath = join(tempDir, 'bad-input.json');
		await writeFile(inputPath, '{"url":');

		const result = await getInputOverride(tempDir, undefined, 'bad-input.json');

		expect(result).toBe(false);
		expect(process.exitCode).toBe(CommandExitCodes.InvalidInput);
		const stderr = logMessages.error.join('\n');
		expect(stderr).toContain(`Cannot parse JSON input file at path "${resolve(tempDir, 'bad-input.json')}".`);
		expect(stderr).toContain('Unexpected end of JSON input');
	});
});

describe('resolveInput', () => {
	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
	});

	it('includes the file path when stored INPUT.json contains malformed JSON', async () => {
		const tempDir = await mkdtemp(join(tmpdir(), 'apify-cli-input-'));
		tempDirs.push(tempDir);
		const kvStorePath = join(tempDir, getLocalKeyValueStorePath());
		await mkdir(kvStorePath, { recursive: true });
		await writeFile(join(kvStorePath, 'INPUT.json'), '{"url":');

		expect(() => resolveInput(tempDir, undefined)).toThrow(
			`Cannot parse JSON input file at path "${join(kvStorePath, 'INPUT.json')}".`,
		);
	});
});
