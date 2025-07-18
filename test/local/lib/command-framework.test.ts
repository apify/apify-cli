import { ValidateInputSchemaCommand } from '../../../src/commands/validate-schema.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { validInputSchemaPath } from '../../__setup__/input-schemas/paths.js';

describe('Command Framework', () => {
	test('testRunCommand helper works', async () => {
		await testRunCommand(ValidateInputSchemaCommand, {
			args_path: validInputSchemaPath,
		});
	});
});
