import { ValidateInputSchemaCommand } from '../../../src/commands/validate-schema.js';
import { runCommand } from '../../../src/lib/command-framework/apify-command.js';
import { validInputSchemaPath } from '../../__setup__/input-schemas/paths.js';

describe('Command Framework', () => {
	test('runCommand helper works', async () => {
		await runCommand(ValidateInputSchemaCommand, {
			args_path: validInputSchemaPath,
		});
	});
});
