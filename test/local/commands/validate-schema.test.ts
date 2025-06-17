import { ValidateInputSchemaCommand } from '../../../src/commands/validate-schema.js';
import { runCommand } from '../../../src/lib/command-framework/apify-command.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import {
	invalidInputSchemaPath,
	unparsableInputSchemaPath,
	validInputSchemaPath,
} from '../../__setup__/input-schemas/paths.js';

const { lastErrorMessage } = useConsoleSpy();

describe('apify validate-schema', () => {
	it('should correctly validate schema 1', async () => {
		await runCommand(ValidateInputSchemaCommand, {
			args_path: validInputSchemaPath,
		});

		expect(lastErrorMessage()).toMatch(/is valid/);
	});

	it('should correctly validate schema 2', async () => {
		await runCommand(ValidateInputSchemaCommand, {
			args_path: invalidInputSchemaPath,
		});

		expect(lastErrorMessage()).to.contain(
			'Field schema.properties.queries.editor must be equal to one of the allowed values',
		);
	});

	it('should correctly validate schema 3', async () => {
		await runCommand(ValidateInputSchemaCommand, {
			args_path: unparsableInputSchemaPath,
		});

		expect(lastErrorMessage()).to.contain.oneOf(['Unexpected token }', "Expected ',' or ']' after array element"]);
	});
});
