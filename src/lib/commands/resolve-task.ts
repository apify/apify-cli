import type { ApifyClient, Task, TaskClient } from 'apify-client';

import { getLocalUserInfo } from '../utils.js';

export interface ResolvedTask {
	id: string;
	userFriendlyId: string;
	title?: string;
	task: Task;
	taskClient: TaskClient;
}

/**
 * Resolves a Task by ID, `username/name`, or bare name under the logged-in account.
 */
export async function resolveTaskId(client: ApifyClient, taskIdOrName: string | undefined): Promise<ResolvedTask> {
	const userInfo = await getLocalUserInfo();
	const usernameOrId = userInfo.username || (userInfo.id as string);

	if (!taskIdOrName) {
		throw new Error('Please provide a valid Task ID or name.');
	}

	if (taskIdOrName.includes('/')) {
		const task = await client.task(taskIdOrName).get();
		if (!task) {
			throw new Error(`Cannot find Task with ID '${taskIdOrName}' in your account.`);
		}

		return {
			id: task.id,
			userFriendlyId: `${task.username ?? usernameOrId}/${task.name}`,
			title: task.title,
			task,
			taskClient: client.task(task.id),
		};
	}

	const byId = await client.task(taskIdOrName).get();
	if (byId) {
		return {
			id: byId.id,
			userFriendlyId: `${byId.username ?? usernameOrId}/${byId.name}`,
			title: byId.title,
			task: byId,
			taskClient: client.task(byId.id),
		};
	}

	const byName = await client.task(`${usernameOrId}/${taskIdOrName.toLowerCase()}`).get();
	if (!byName) {
		throw new Error(`Cannot find Task with name '${taskIdOrName}' in your account.`);
	}

	return {
		id: byName.id,
		userFriendlyId: `${byName.username ?? usernameOrId}/${byName.name}`,
		title: byName.title,
		task: byName,
		taskClient: client.task(byName.id),
	};
}

/**
 * Like {@link resolveTaskId}, but returns `null` instead of throwing when the Task is missing.
 */
export async function tryToGetTask(client: ApifyClient, taskIdOrName: string): Promise<ResolvedTask | null> {
	try {
		return await resolveTaskId(client, taskIdOrName);
	} catch {
		return null;
	}
}
