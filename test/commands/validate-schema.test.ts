import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ValidateInputSchemaCommand } from '../../src/commands/validate-schema.js';
import { runCommand } from '../../src/lib/command-framework/apify-command.js';
import { useConsoleSpy } from '../__setup__/hooks/useConsoleSpy.js';

const basePath = join(fileURLToPath(import.meta.url), '../../__setup__/input-schemas/');

const { lastErrorMessage } = useConsoleSpy();

describe('apify validate-schema', () => {
	it('should correctly validate schema 1', async () => {
		await runCommand(ValidateInputSchemaCommand, {
			args_path: join(basePath, 'valid.json'),
		});

		expect(lastErrorMessage()).toMatch(/is valid/);
	});

	it('should correctly validate schema 2', async () => {
		await runCommand(ValidateInputSchemaCommand, {
			args_path: join(basePath, 'invalid.json'),
		});

		expect(lastErrorMessage()).to.contain(
			'Field schema.properties.queries.editor must be equal to one of the allowed values',
		);
	});

	it('should correctly validate schema 3', async () => {
		await runCommand(ValidateInputSchemaCommand, {
			args_path: join(basePath, 'unparsable.json'),
		});

		expect(lastErrorMessage()).to.contain.oneOf(['Unexpected token }', "Expected ',' or ']' after array element"]);
	});
});
