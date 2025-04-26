import { writeFileSync } from 'node:fs';
import { platform } from 'node:os';

import { cryptoRandomObjectId } from '@apify/utilities';

import { waitForBuildToFinishWithTimeout } from '../../__setup__/build-utils.js';
import { testUserClient } from '../../__setup__/config.js';
import { safeLogin, useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const actName = `task-on-my-actor-${cryptoRandomObjectId(6)}-${process.version.split('.')[0]}-${platform()}`;
const taskName = `my-task-${cryptoRandomObjectId(6)}-${process.version.split('.')[0]}-${platform()}`;

useAuthSetup({ perTest: false });

const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath } = useTempPath(actName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: true,
});

const { CreateCommand } = await import('../../../src/commands/create.js');
const { ActorsPushCommand } = await import('../../../src/commands/actors/push.js');
const { TaskRunCommand } = await import('../../../src/commands/task/run.js');

const expectedOutput = {
	test: 'hello world!!',
};

describe('apify task run', () => {
	let actorId: string;
	let taskId: string;

	beforeAll(async () => {
		await beforeAllCalls();

		const { username } = await testUserClient.user('me').get();

		await safeLogin();
		await CreateCommand.run([actName, '--template', 'project_empty', '--skip-dependency-install'], import.meta.url);

		const actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {
            await Actor.setValue('OUTPUT', await Actor.getInput());
            console.log('Done.');
        });
        `;

		writeFileSync(joinPath('src/main.js'), actCode, { flag: 'w' });

		toggleCwdBetweenFullAndParentPath();
		await ActorsPushCommand.run(['--no-prompt', '--force'], import.meta.url);

		actorId = `${username}/${actName}`;

		// Build must finish before doing `apify call`, otherwise we would get nonexisting build with "LATEST" tag error.
		const builds = await testUserClient.actor(actorId).builds().list();
		const lastBuild = builds.items.pop();
		await waitForBuildToFinishWithTimeout(testUserClient, lastBuild!.id);

		// Make a task for this actor
		const task = await testUserClient.tasks().create({
			actId: actorId,
			name: taskName,
			input: expectedOutput,
		});

		taskId = `${username}/${task.name}`;
	});

	afterAll(async () => {
		await testUserClient.task(taskId).delete();
		await testUserClient.actor(actorId).delete();

		await afterAllCalls();
	});

	it('should work with just the task name', async () => {
		await expect(TaskRunCommand.run([taskName], import.meta.url)).resolves.toBeUndefined();

		const taskClient = testUserClient.task(taskId);
		const runs = await taskClient.runs().list();
		const lastRun = runs.items.pop();
		const lastRunDetail = await testUserClient.run(lastRun!.id).get();
		const output = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('OUTPUT');

		expect(expectedOutput).toStrictEqual(output!.value);
	});

	it('should work with the full name', async () => {
		await expect(TaskRunCommand.run([taskId], import.meta.url)).resolves.toBeUndefined();

		const taskClient = testUserClient.task(taskId);
		const runs = await taskClient.runs().list();
		const lastRun = runs.items.pop();
		const lastRunDetail = await testUserClient.run(lastRun!.id).get();
		const output = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('OUTPUT');

		expect(expectedOutput).toStrictEqual(output!.value);
	});
});
