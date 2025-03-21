import { fileURLToPath } from 'node:url';

import { ValidateInputSchemaCommand } from '../../src/commands/validate-schema.js';
import { runCommand } from '../../src/lib/command-framework/apify-command.js';

const path = fileURLToPath(new URL('../__setup__/input-schemas/valid.json', import.meta.url));

describe.skip('Command Framework', () => {
	test('runCommand helper works', async () => {
		await runCommand(ValidateInputSchemaCommand, {
			args_path: path,
		});
	});
});
