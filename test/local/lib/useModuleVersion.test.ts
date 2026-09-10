import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const moduleName = 'apify-cli-probe-module';

const { beforeAllCalls, afterAllCalls, joinPath, tmpPath } = useTempPath('use-module-version', {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { useCwdProject } = await import('../../../src/lib/hooks/useCwdProject.js');
const { useModuleVersion } = await import('../../../src/lib/hooks/useModuleVersion.js');

describe('useModuleVersion', () => {
	beforeAll(async () => {
		await beforeAllCalls();

		writeFileSync(joinPath('package.json'), JSON.stringify({ name: 'probe-project', version: '0.0.1' }));

		const modulePath = joinPath('node_modules', moduleName);
		mkdirSync(modulePath, { recursive: true });
		writeFileSync(join(modulePath, 'package.json'), JSON.stringify({ name: moduleName, version: '1.2.3' }));
		writeFileSync(join(modulePath, 'index.js'), 'module.exports = {};');
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	// The probe runs in a child process, which only looks in the project when it is given the cwd explicitly.
	it('reads the version from the project the CLI runs in', async () => {
		const project = (await useCwdProject({ cwd: tmpPath })).unwrap();

		const version = await useModuleVersion({ moduleName, project });

		expect(version.unwrapOr(null)).toStrictEqual('1.2.3');
	});

	it('returns none for a module the project does not have', async () => {
		const project = (await useCwdProject({ cwd: tmpPath })).unwrap();

		const version = await useModuleVersion({ moduleName: `${moduleName}-missing`, project });

		expect(version.isNone()).toStrictEqual(true);
	});
});
