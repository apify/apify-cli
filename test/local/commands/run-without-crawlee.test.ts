import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { getLocalDatasetPath, getLocalKeyValueStorePath, getLocalRequestQueuePath } from '../../../src/lib/utils.js';
import { TEST_TIMEOUT } from '../../__setup__/consts.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';
import { resetCwdCaches } from '../../__setup__/reset-cwd-caches.js';

const actName = 'run-without-crawlee';

useAuthSetup({ perTest: true });

const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath } = useTempPath(actName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: true,
});

useConsoleSpy();

const { CreateCommand } = await import('../../../src/commands/create.js');
const { RunCommand } = await import('../../../src/commands/run.js');

// Without dependencies there is no crawlee to purge the storage on start, so the
// CLI has to do it. That is a different code path than the one crawlee projects take.
describe('apify run without crawlee', () => {
	beforeAll(async () => {
		await beforeAllCalls();

		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: 'project_empty',
			flags_skipDependencyInstall: true,
		});

		toggleCwdBetweenFullAndParentPath();
	}, TEST_TIMEOUT);

	afterAll(async () => {
		await afterAllCalls();
	});

	beforeEach(() => {
		resetCwdCaches();
	});

	it('purges the default stores itself', async () => {
		const markerPath = joinPath('result.txt');
		const inputPath = joinPath(getLocalKeyValueStorePath(), 'INPUT.json');
		const testJsonPath = joinPath(getLocalKeyValueStorePath(), 'TEST.json');

		writeFileSync(
			joinPath('src/main.js'),
			`
import { writeFileSync } from 'node:fs';
writeFileSync(String.raw\`${markerPath}\`, 'hello world');
`,
			{ flag: 'w' },
		);

		mkdirSync(joinPath(getLocalKeyValueStorePath()), { recursive: true });
		mkdirSync(joinPath(getLocalDatasetPath()), { recursive: true });
		mkdirSync(joinPath(getLocalRequestQueuePath()), { recursive: true });
		writeFileSync(inputPath, '{}', { flag: 'w' });
		writeFileSync(testJsonPath, '{}', { flag: 'w' });
		writeFileSync(joinPath(getLocalDatasetPath(), '000000001.json'), '{}', { flag: 'w' });
		writeFileSync(joinPath(getLocalRequestQueuePath(), 'request.json'), '{}', { flag: 'w' });

		await testRunCommand(RunCommand, { flags_purge: true });

		// The marker proves the Actor ran, so an empty storage cannot come from an early exit.
		expect(existsSync(markerPath)).toStrictEqual(true);
		expect(existsSync(inputPath)).toStrictEqual(true);
		expect(existsSync(testJsonPath)).toStrictEqual(false);
		expect(existsSync(joinPath(getLocalDatasetPath()))).toStrictEqual(false);
		expect(existsSync(joinPath(getLocalRequestQueuePath()))).toStrictEqual(false);
	});
});
