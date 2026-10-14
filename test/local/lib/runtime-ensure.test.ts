import { readFileSync } from 'node:fs';

import { ACTOR_RUNTIME_CONFIG_FILE_PATH } from '../../../src/lib/consts.js';
import { DEFAULT_ACTOR_RUNTIME_IMAGE } from '../../../src/lib/runtime/docker.js';
import { installedActorRuntimeImage, rememberInstalledActorRuntimeImage } from '../../../src/lib/runtime/ensure.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';

useAuthSetup();

describe('runtime/ensure installed image', () => {
	it('falls back to the default image when nothing was installed yet', () => {
		expect(installedActorRuntimeImage()).toBe(DEFAULT_ACTOR_RUNTIME_IMAGE);
	});

	it('remembers the installed image for the next start', () => {
		rememberInstalledActorRuntimeImage('apify/actor-runtime:master-5462005');

		expect(installedActorRuntimeImage()).toBe('apify/actor-runtime:master-5462005');
		expect(JSON.parse(readFileSync(ACTOR_RUNTIME_CONFIG_FILE_PATH(), 'utf-8'))).toEqual({
			image: 'apify/actor-runtime:master-5462005',
		});
	});
});
