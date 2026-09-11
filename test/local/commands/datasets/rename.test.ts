import process from 'node:process';

import { describe, afterEach, it, expect } from 'vitest';

import { DatasetsRenameCommand } from '../../../../src/commands/datasets/rename.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';

const { lastErrorMessage } = useConsoleSpy();

describe('apify datasets rename', () => {
	afterEach(() => {
		process.exitCode = undefined;
	});

	it('exits with code 1 when neither new-name nor --unname is provided', async () => {
		await testRunCommand(DatasetsRenameCommand, { args_nameOrId: 'my-dataset' });
		expect(process.exitCode).toBe(1);
		expect(lastErrorMessage()).toMatch(/You must provide either a new name or the --unname flag/);
	});
});
