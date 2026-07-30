import type { ApifyClient } from 'apify-client';

import { resolveTaskId, tryToGetTask } from '../../../src/lib/commands/resolve-task.js';

const sampleTask = {
	id: 'task-id-1',
	name: 'my-task',
	username: 'alice',
	title: 'My Task',
	userId: 'user-1',
	actId: 'act-1',
	createdAt: new Date(),
	modifiedAt: new Date(),
};

function fakeClient(handlers: { byKey: Record<string, typeof sampleTask | null | undefined> }): ApifyClient {
	return {
		task: (idOrName: string) => ({
			get: async () => {
				if (Object.prototype.hasOwnProperty.call(handlers.byKey, idOrName)) {
					return handlers.byKey[idOrName] ?? undefined;
				}
				return undefined;
			},
		}),
	} as unknown as ApifyClient;
}

vitest.mock('../../../src/lib/utils.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../src/lib/utils.js')>();
	return {
		...actual,
		getLocalUserInfo: async () => ({ username: 'alice', id: 'user-1' }),
	};
});

describe('resolveTaskId', () => {
	it('resolves username/name', async () => {
		const client = fakeClient({
			byKey: {
				'alice/my-task': sampleTask,
			},
		});

		const resolved = await resolveTaskId(client, 'alice/my-task');
		expect(resolved.id).toBe('task-id-1');
		expect(resolved.userFriendlyId).toBe('alice/my-task');
		expect(resolved.title).toBe('My Task');
	});

	it('resolves a bare ID', async () => {
		const client = fakeClient({
			byKey: {
				'task-id-1': sampleTask,
			},
		});

		const resolved = await resolveTaskId(client, 'task-id-1');
		expect(resolved.id).toBe('task-id-1');
		expect(resolved.userFriendlyId).toBe('alice/my-task');
	});

	it('resolves a bare name', async () => {
		const client = fakeClient({
			byKey: {
				'task-id-1': null,
				'alice/my-task': sampleTask,
			},
		});

		const resolved = await resolveTaskId(client, 'my-task');
		expect(resolved.id).toBe('task-id-1');
		expect(resolved.userFriendlyId).toBe('alice/my-task');
	});

	it('lowercases the bare name', async () => {
		const lookups: string[] = [];
		const client = {
			task: (idOrName: string) => ({
				get: async () => {
					lookups.push(idOrName);
					if (idOrName === 'alice/my-task') return sampleTask;
					return undefined;
				},
			}),
		} as unknown as ApifyClient;

		await resolveTaskId(client, 'My-Task');
		expect(lookups).toContain('alice/my-task');
		expect(lookups).not.toContain('alice/My-Task');
	});

	it('throws when the task does not exist', async () => {
		const client = fakeClient({ byKey: {} });
		await expect(resolveTaskId(client, 'missing')).rejects.toThrow(/Cannot find Task with name 'missing'/);
	});
});

describe('tryToGetTask', () => {
	it('returns null instead of throwing', async () => {
		const client = fakeClient({ byKey: {} });
		await expect(tryToGetTask(client, 'missing')).resolves.toBeNull();
	});
});
