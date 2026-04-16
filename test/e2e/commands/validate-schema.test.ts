import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runCli } from '../__helpers__/run-cli.js';
import { createTestActor, removeTestActor, type TestActor } from '../__helpers__/test-actor.js';

describe('[e2e] apify validate-schema', () => {
	let actor: TestActor;

	beforeAll(async () => {
		actor = await createTestActor();

		// The project_empty template doesn't include an input schema,
		// so we create a valid one for testing.
		const inputSchema = {
			title: 'Test input schema',
			description: 'A test input schema',
			type: 'object',
			schemaVersion: 1,
			properties: {
				testField: {
					title: 'Test Field',
					type: 'string',
					description: 'A test field',
					editor: 'textfield',
				},
			},
		};

		await writeFile(path.join(actor.dir, '.actor', 'INPUT_SCHEMA.json'), JSON.stringify(inputSchema, null, 2));
	});

	afterAll(async () => {
		if (actor) await removeTestActor(actor);
	});

	it('validates a valid input schema', async () => {
		const result = await runCli('apify', ['validate-schema'], { cwd: actor.dir });

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stderr).toContain('Input schema is valid');
	});
});
