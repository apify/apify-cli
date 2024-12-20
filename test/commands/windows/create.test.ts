import { existsSync } from 'node:fs';

import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const actName = 'create-my-spaced-actor';
const { beforeAllCalls, afterAllCalls, joinPath } = useTempPath('spaced actor', {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { CreateCommand } = await import('../../../src/commands/create.js');

describe.runIf(process.env.FORCE_WINDOWS_TESTS || process.platform === 'win32')('apify create on windows', () => {
	beforeEach(async () => {
		await beforeAllCalls();
	});

	afterEach(async () => {
		await afterAllCalls();
	});

	it('works for creating an actor when the folder path contains spaces', async () => {
		const ACT_TEMPLATE = 'python-playwright';
		await CreateCommand.run([actName, '--template', ACT_TEMPLATE], import.meta.url);

		// check files structure
		expect(existsSync(joinPath(actName))).toBeTruthy();
	});
});
