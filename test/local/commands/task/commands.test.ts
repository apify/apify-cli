import { writeFileSync } from 'node:fs';
import process from 'node:process';

import type { ApifyClient } from 'apify-client';

import { TaskCreateCommand } from '../../../../src/commands/task/create.js';
import { TaskInfoCommand } from '../../../../src/commands/task/info.js';
import { TaskLsCommand } from '../../../../src/commands/task/ls.js';
import { TaskUpdateCommand } from '../../../../src/commands/task/update.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { useAuthSetup } from '../../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';

useAuthSetup({ perTest: true });

const { lastErrorMessage, lastLogMessage, logMessages } = useConsoleSpy();

const { beforeAllCalls, afterAllCalls, joinPath } = useTempPath('task-commands', {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const sampleTask = {
	id: 'task-id-1',
	name: 'my-task',
	username: 'alice',
	title: 'My Task',
	userId: 'user-1',
	actId: 'act-1',
	createdAt: new Date('2024-01-01T00:00:00.000Z'),
	modifiedAt: new Date('2024-01-02T00:00:00.000Z'),
	description: 'A task',
	options: { memoryMbytes: 1024, timeoutSecs: 60, build: 'latest' },
	stats: { totalRuns: 3 },
	input: { hello: 'world' },
};

let mockClient: ApifyClient;
let createCalls: unknown[] = [];
let updateCalls: unknown[] = [];

vitest.mock('../../../../src/lib/utils.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../../src/lib/utils.js')>();
	return {
		...actual,
		getLoggedClientOrThrow: async () => mockClient,
		getLocalUserInfo: async () => ({ username: 'alice', id: 'user-1' }),
	};
});

vitest.mock('../../../../src/lib/commands/resolve-actor-context.js', () => ({
	resolveActorContext: async () => ({
		valid: true,
		id: 'act-1',
		userFriendlyId: 'apify/hello-world',
	}),
}));

beforeAll(async () => {
	await beforeAllCalls();
});

afterAll(async () => {
	await afterAllCalls();
});

beforeEach(() => {
	createCalls = [];
	updateCalls = [];
	process.exitCode = undefined;

	mockClient = {
		tasks: () => ({
			create: async (payload: unknown) => {
				createCalls.push(payload);
				return { ...sampleTask, ...(payload as object) };
			},
			list: async () => ({
				total: 1,
				count: 1,
				offset: 0,
				limit: 20,
				desc: false,
				items: [sampleTask],
			}),
		}),
		task: (idOrName: string) => ({
			get: async () => {
				if (idOrName === 'missing-task') return undefined;
				if (idOrName === 'alice/missing-task') return undefined;
				if (idOrName === 'alice/my-task' || idOrName === 'task-id-1' || idOrName === 'my-task') {
					return sampleTask;
				}
				return undefined;
			},
			getInput: async () => sampleTask.input,
			update: async (payload: unknown) => {
				updateCalls.push(payload);
				return { ...sampleTask, ...(payload as object), name: (payload as { name?: string }).name ?? sampleTask.name };
			},
			delete: async () => undefined,
		}),
		user: () => ({
			get: async () => ({ username: 'alice', id: 'user-1' }),
		}),
		actor: () => ({
			get: async () => ({
				id: 'act-1',
				name: 'hello-world',
				username: 'apify',
				title: 'Hello World',
			}),
		}),
	} as unknown as ApifyClient;
});

afterEach(() => {
	process.exitCode = undefined;
});

describe('apify task commands (local)', () => {
	it('rejects --input and --input-file together', async () => {
		await expect(
			testRunCommand(TaskCreateCommand, {
				args_taskName: 'new-task',
				flags_actor: 'apify/hello-world',
				flags_input: '{}',
				flags_inputFile: './input.json',
			}),
		).rejects.toThrow(/APIFY_FLAG_IS_EXCLUSIVE_WITH_ANOTHER_FLAG/);
	});

	it('rejects malformed --input JSON', async () => {
		await testRunCommand(TaskCreateCommand, {
			args_taskName: 'new-task',
			flags_actor: 'apify/hello-world',
			flags_input: '{not-json',
		});

		expect(lastErrorMessage()).toMatch(/Cannot parse JSON input/i);
		expect(process.exitCode).toBeTruthy();
	});

	it('rejects malformed --input-file JSON', async () => {
		const inputPath = joinPath('bad-input.json');
		writeFileSync(inputPath, '{bad');

		await testRunCommand(TaskCreateCommand, {
			args_taskName: 'new-task',
			flags_actor: 'apify/hello-world',
			flags_inputFile: inputPath,
		});

		expect(lastErrorMessage()).toMatch(/Cannot read input file|Cannot parse JSON/i);
		expect(process.exitCode).toBeTruthy();
	});

	it('prints human-readable create output', async () => {
		await testRunCommand(TaskCreateCommand, {
			args_taskName: 'new-task',
			flags_actor: 'apify/hello-world',
			flags_input: '{"url":"https://example.com"}',
		});

		expect(createCalls).toHaveLength(1);
		expect(lastLogMessage()).toMatch(/was created/i);
	});

	it('reports API create failures with a non-zero exit code', async () => {
		mockClient = {
			...mockClient,
			tasks: () => ({
				create: async () => {
					throw Object.assign(new Error('Task name is not unique'), {
						type: 'actor-task-name-not-unique',
					});
				},
			}),
		} as unknown as ApifyClient;

		await testRunCommand(TaskCreateCommand, {
			args_taskName: 'new-task',
			flags_actor: 'apify/hello-world',
		});

		expect(logMessages.log.join('\n')).toMatch(/Failed to create Task/i);
		expect(process.exitCode).toBeTruthy();
	});

	it('requires at least one update flag', async () => {
		await testRunCommand(TaskUpdateCommand, {
			args_taskId: 'my-task',
		});

		expect(logMessages.log.join('\n')).toMatch(/Provide at least one of/i);
		expect(process.exitCode).toBeTruthy();
	});

	it('prints human-readable update output using the updated name', async () => {
		await testRunCommand(TaskUpdateCommand, {
			args_taskId: 'my-task',
			flags_title: 'Renamed',
		});

		expect(updateCalls).toHaveLength(1);
		expect(lastLogMessage()).toMatch(/my-task/);
		expect(lastLogMessage()).toMatch(/was updated/i);
	});

	it('prints human-readable ls output', async () => {
		await testRunCommand(TaskLsCommand, {});
		const output = logMessages.log.join('\n');
		expect(output).toContain('alice/my-task');
		expect(output).toContain('task-id-1');
	});

	it('prints human-readable info output', async () => {
		await testRunCommand(TaskInfoCommand, {
			args_taskId: 'my-task',
		});
		const output = logMessages.log.join('\n');
		expect(output).toContain('task-id-1');
		expect(output).toContain('my-task');
	});

	it('propagates resolve failures as non-zero exit for info', async () => {
		await testRunCommand(TaskInfoCommand, {
			args_taskId: 'missing-task',
		});

		expect(lastErrorMessage()).toMatch(/Cannot find Task/i);
		expect(process.exitCode).toBeTruthy();
	});
});
