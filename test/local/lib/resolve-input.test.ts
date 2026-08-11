import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

import { getInputOverride } from '../../../src/lib/commands/resolve-input.js';
import { CommandExitCodes } from '../../../src/lib/consts.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

const SCHEMA_HINT = 'Run "apify actors info apify/hello-world --input" to inspect the Actor input schema.';

const { logMessages } = useConsoleSpy();

describe('getInputOverride', () => {
	afterEach(() => {
		process.exitCode = undefined;
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
});
