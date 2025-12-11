import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { ActorCalculateMemoryCommand } from '../../../../src/commands/actor/calculate-memory.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH } from '../../../../src/lib/consts.js';
import { getLocalKeyValueStorePath } from '../../../../src/lib/utils.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';
import { resetCwdCaches } from '../../../__setup__/reset-cwd-caches.js';

const { beforeAllCalls, afterAllCalls, joinPath } = useTempPath('calculate-memory', {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { lastErrorMessage, lastLogMessage } = useConsoleSpy();

const createActorJson = async (overrides: Record<string, unknown> = {}) => {
	const actorJson = { ...EMPTY_LOCAL_CONFIG, ...overrides };

	await mkdir(joinPath('.actor'), { recursive: true });
	writeFileSync(joinPath(LOCAL_CONFIG_PATH), JSON.stringify(actorJson, null, '\t'), { flag: 'w' });
};

describe('apify actor calculate-memory', () => {
	const START_URLS_LENGTH_BASED_MEMORY_EXPRESSION = "get(input, 'startUrls.length', 1) * 1024";
	const DEFAULT_INPUT = { startUrls: [1, 2, 3, 4] };

	const inputPath = joinPath(getLocalKeyValueStorePath('default'), 'INPUT.json');

	beforeAll(async () => {
		mkdirSync(dirname(inputPath), { recursive: true });
		writeFileSync(inputPath, JSON.stringify(DEFAULT_INPUT), { flag: 'w' });
		await beforeAllCalls();
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	beforeEach(() => {
		resetCwdCaches();
	});

	it('should fail when default memory is not provided in flags or actor.json', async () => {
		await createActorJson();

		await testRunCommand(ActorCalculateMemoryCommand, {});

		expect(lastErrorMessage()).toMatch(/No memory-calculation expression found./);
	});

	it('should calculate memory using defaultMemoryMbytes flag', async () => {
		await testRunCommand(ActorCalculateMemoryCommand, {
			flags_input: `${getLocalKeyValueStorePath('default')}/INPUT.json`,
			flags_defaultMemoryMbytes: START_URLS_LENGTH_BASED_MEMORY_EXPRESSION,
		});

		expect(lastLogMessage()).toMatch(/4096 MB/);
	});

	it('should calculate memory using expression from actor.json', async () => {
		await createActorJson({ defaultMemoryMbytes: START_URLS_LENGTH_BASED_MEMORY_EXPRESSION });

		await testRunCommand(ActorCalculateMemoryCommand, {
			flags_input: `${getLocalKeyValueStorePath('default')}/INPUT.json`,
		});

		expect(lastLogMessage()).toMatch(/4096 MB/);
	});

	it('should fallback to default input path if input flag is not provided', async () => {
		await createActorJson({ defaultMemoryMbytes: START_URLS_LENGTH_BASED_MEMORY_EXPRESSION });

		await testRunCommand(ActorCalculateMemoryCommand, {});

		expect(lastLogMessage()).toMatch(/4096 MB/);
	});

	it('should report error if memory calculation expression is invalid', async () => {
		await createActorJson({ defaultMemoryMbytes: 'invalid expression' });

		await testRunCommand(ActorCalculateMemoryCommand, {
			flags_defaultMemoryMbytes: 'invalid expression',
		});

		expect(lastErrorMessage()).toMatch(/Memory calculation failed: /);
	});
});
