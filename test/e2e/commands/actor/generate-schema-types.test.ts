import { access } from 'node:fs/promises';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

import { runCli } from '../../__helpers__/run-cli.js';
import { createTestActor, removeTestActor, type TestActor } from '../../__helpers__/test-actor.js';

describe('[e2e] actor generate-schema-types', () => {
	let actor: TestActor;

	beforeAll(async () => {
		actor = await createTestActor();

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

		await writeFile(
			path.join(actor.dir, '.actor', 'INPUT_SCHEMA.json'),
			JSON.stringify(inputSchema, null, 2),
		);
	});

	afterAll(async () => {
		if (actor) await removeTestActor(actor);
	});

	it('generates TypeScript types from input schema', async () => {
		const result = await runCli('apify', ['actor', 'generate-schema-types'], { cwd: actor.dir });

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stderr).toContain('Generated types written to');

		await expect(
			access(path.join(actor.dir, 'src', '.generated', 'actor', 'input.ts')),
		).resolves.toBeUndefined();
	});

	it('respects --output flag', async () => {
		const customDir = path.join(actor.dir, 'custom-types');

		const result = await runCli('apify', ['actor', 'generate-schema-types', '--output', customDir], {
			cwd: actor.dir,
		});

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		await expect(access(path.join(customDir, 'input.ts'))).resolves.toBeUndefined();
	});
});
