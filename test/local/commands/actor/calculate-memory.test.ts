import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { ActorCalculateMemoryCommand } from '../../../../src/commands/actor/calculate-memory.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH } from '../../../../src/lib/consts.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../../__setup__/hooks/useTempPath.js';

const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath } = useTempPath('calculate-memory', {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { lastErrorMessage } = useConsoleSpy();

const createActorJson = async (overrides: Record<string, unknown> = {}) => {
	const actorJson = { ...EMPTY_LOCAL_CONFIG, ...overrides };

	await mkdir(joinPath('.actor'), { recursive: true });
	writeFileSync(joinPath(LOCAL_CONFIG_PATH), JSON.stringify(actorJson, null, '\t'), { flag: 'w' });
};

describe('apify actor calculate-memory', () => {
	beforeEach(async () => {
		await beforeAllCalls();
		toggleCwdBetweenFullAndParentPath();
	});

	afterEach(async () => {
		await afterAllCalls();
	});

	it('should fail when default memory is not provided and actor.json is missing', async () => {
		await testRunCommand(ActorCalculateMemoryCommand, {});

		expect(lastErrorMessage()).toMatch(/actor.json not found at/);
	});

	it('should fail when default memory is not provided in flags or actor.json', async () => {
		await createActorJson();

		await testRunCommand(ActorCalculateMemoryCommand, {});

		expect(lastErrorMessage()).toMatch(/No memory-calculation expression found./);
	});

	it('should calculate memory using defaultMemoryMbytes flag', async () => {
		await testRunCommand(ActorCalculateMemoryCommand, {
			flags_input: 'INPUT.json',
			flags_defaultMemoryMbytes: '512',
		});

		expect(lastErrorMessage()).toMatch(/Calculated memory: 512 MB/);
	});

	it('should calculate memory using expression from .actor.json', async () => {
		writeFileSync(joinPath('INPUT.json'), JSON.stringify({ startUrls: [1, 2, 3, 4] }));

		await createActorJson({ defaultMemoryMbytes: "get(input, 'startUrls.length') * 1024" });

		await testRunCommand(ActorCalculateMemoryCommand, {
			flags_input: 'INPUT.json',
		});

		expect(lastErrorMessage()).toMatch(/Calculated memory: 4096 MB/);
	});

	it('should fallback to default input path if input flag is not provided', async () => {
		const defaultInputPath = joinPath('storage/key_value_stores/default');
		mkdirSync(defaultInputPath, { recursive: true });
		writeFileSync(join(defaultInputPath, 'INPUT.json'), JSON.stringify({ memory: 128 }));

		await createActorJson({ defaultMemoryMbytes: 'input.memory' });

		await testRunCommand(ActorCalculateMemoryCommand, {});

		expect(lastErrorMessage()).toMatch(/Calculated memory: 128 MB/);
	});

	it('should report error if memory calculation expression is invalid', async () => {
		await createActorJson({ defaultMemoryMbytes: 'invalid expression' });

		await testRunCommand(ActorCalculateMemoryCommand, {
			flags_defaultMemoryMbytes: 'invalid expression',
		});

		expect(lastErrorMessage()).toMatch(/Memory calculation failed: /);
	});
});
