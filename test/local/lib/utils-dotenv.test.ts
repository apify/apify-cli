import { writeFileSync } from 'node:fs';

import { execWithLog } from '../../../src/lib/exec.js';
import { ensureFolderExistsSync } from '../../../src/lib/files.js';
import { getActorLocalFilePaths } from '../../../src/lib/utils.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const FILES = [
	'main.js',
	'.env',
	'.env.local',
	'.env.production',
	'.env.example',
	'.envrc',
	'my.env',
	'env.json',
	'src/.env',
	'.actor/actor.json',
	'.actor/.env',
	'.actor/.env.local',
	'.actor/.env.example',
];

describe('getActorLocalFilePaths() with .env files', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('dotenv-push-test', {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	let paths: string[];

	beforeAll(async () => {
		await beforeAllCalls();

		// A fresh repo, so the apify-cli .gitignore doesn't apply. Nothing git-ignores the .env files.
		await execWithLog({ cmd: 'git', args: ['init'], opts: { cwd: tmpPath } });

		ensureFolderExistsSync(tmpPath, 'src');
		ensureFolderExistsSync(tmpPath, '.actor');
		for (const file of FILES) {
			writeFileSync(joinPath(file), 'KEY=value');
		}

		// A force-include must not bring .env back.
		writeFileSync(joinPath('.actorignore'), '!.env\n');

		paths = await getActorLocalFilePaths(tmpPath);
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it.each(['.env', '.env.local', '.env.production', 'src/.env', '.actor/.env', '.actor/.env.local'])(
		'leaves out %s',
		(file) => {
			expect(paths).not.toContain(file);
		},
	);

	it.each(['main.js', '.env.example', '.actor/.env.example', '.envrc', 'my.env', 'env.json', '.actor/actor.json'])(
		'keeps %s',
		(file) => {
			expect(paths).toContain(file);
		},
	);
});
