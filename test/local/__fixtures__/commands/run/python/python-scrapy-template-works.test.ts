import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runCommand } from '../../../../../../src/lib/command-framework/apify-command.js';
import { getLocalDatasetPath } from '../../../../../../src/lib/utils.js';
import { safeLogin, useAuthSetup } from '../../../../../__setup__/hooks/useAuthSetup.js';
import { useTempPath } from '../../../../../__setup__/hooks/useTempPath.js';

const actorName = 'python-scrapy-template-works';

const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath } = useTempPath(actorName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: true,
});

useAuthSetup({ perTest: false });

const { CreateCommand } = await import('../../../../../../src/commands/create.js');
const { RunCommand } = await import('../../../../../../src/commands/run.js');

describe('[python] scrapy template works', () => {
	beforeAll(async () => {
		await beforeAllCalls();

		await safeLogin();

		await runCommand(CreateCommand, { flags_template: 'python-scrapy', args_actorName: actorName });
		toggleCwdBetweenFullAndParentPath();
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should run the actor', async () => {
		await runCommand(RunCommand, {});

		const datasetDirectory = joinPath(getLocalDatasetPath('default'));
		const datasetMetadataFile = join(datasetDirectory, '__metadata__.json');
		expect(existsSync(datasetMetadataFile)).toBe(true);

		const datasetMetadata = JSON.parse(readFileSync(datasetMetadataFile, 'utf8'));
		expect(datasetMetadata.item_count).toBeGreaterThanOrEqual(4);
	});
});
