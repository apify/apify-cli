import { existsSync } from 'node:fs';

import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';

const actName = 'create-my-spaced-actor';
const { beforeAllCalls, afterAllCalls, joinPath } = useTempPath('spaced actor', {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { CreateCommand } = await import('../../../../src/commands/create.js');

describe.runIf(process.env.FORCE_WINDOWS_TESTS || process.platform === 'win32')(
	'[windows] works for creating an actor when the folder path contains spaces',
	() => {
		beforeEach(async () => {
			await beforeAllCalls();
		});

		afterEach(async () => {
			await afterAllCalls();
		});

		it('should work', async () => {
			const ACT_TEMPLATE = 'python-playwright';
			await testRunCommand(CreateCommand, { args_actorName: actName, flags_template: ACT_TEMPLATE });

			// check files structure
			expect(existsSync(joinPath(actName))).toBeTruthy();
		});
	},
);
