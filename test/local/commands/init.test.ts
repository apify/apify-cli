import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

import { KEY_VALUE_STORE_KEYS } from '@apify/consts';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH } from '../../../src/lib/consts.js';
import { getLocalKeyValueStorePath } from '../../../src/lib/utils.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';
import { resetCwdCaches } from '../../__setup__/reset-cwd-caches.js';

const actName = 'init-my-actor';
const { beforeAllCalls, afterAllCalls, joinPath } = useTempPath(actName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { logMessages } = useConsoleSpy();

const { InitCommand } = await import('../../../src/commands/init.js');

describe('apify init', () => {
	beforeEach(async () => {
		await beforeAllCalls();
		resetCwdCaches();
	});

	afterEach(async () => {
		await afterAllCalls();
	});

	it('correctly creates basic structure with empty INPUT.json', async () => {
		await testRunCommand(InitCommand, {
			args_actorName: actName,
			flags_yes: true,
		});

		// Check that it won't create deprecated config
		// TODO: We can remove this later
		const apifyJsonPath = 'apify.json';
		expect(existsSync(joinPath(apifyJsonPath))).toBeFalsy();

		expect(JSON.parse(readFileSync(joinPath(LOCAL_CONFIG_PATH), 'utf8'))).toStrictEqual(
			Object.assign(EMPTY_LOCAL_CONFIG, { name: actName }),
		);
		expect(
			JSON.parse(readFileSync(joinPath(getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`), 'utf8')),
		).toStrictEqual({});
		expect(
			JSON.parse(
				readFileSync(joinPath(getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.__metadata__.json`), 'utf8'),
			),
		).toStrictEqual({
			key: KEY_VALUE_STORE_KEYS.INPUT,
			contentType: 'application/json; charset=utf-8',
			filename: `${KEY_VALUE_STORE_KEYS.INPUT}.json`,
		});
	});

	it('correctly creates structure with prefilled INPUT.json', async () => {
		const input = {
			title: 'Scrape data from a web page',
			type: 'object',
			schemaVersion: 1,
			properties: {
				url: {
					title: 'URL of the page',
					type: 'string',
					description: 'The URL of website you want to get the data from.',
					editor: 'textfield',
					prefill: 'https://www.apify.com/',
				},
			},
			required: ['url'],
		};

		const defaultActorJson = Object.assign(EMPTY_LOCAL_CONFIG, {
			name: actName,
			input,
		});

		await mkdir(joinPath('.actor'), { recursive: true });
		writeFileSync(joinPath(LOCAL_CONFIG_PATH), JSON.stringify(defaultActorJson, null, '\t'), { flag: 'w' });
		await testRunCommand(InitCommand, {
			args_actorName: actName,
			flags_yes: true,
		});

		// Check that it won't create deprecated config
		// TODO: We can remove this later
		const apifyJsonPath = 'apify.json';
		expect(existsSync(joinPath(apifyJsonPath))).toBeFalsy();
		expect(JSON.parse(readFileSync(joinPath(LOCAL_CONFIG_PATH), 'utf8'))).toStrictEqual(defaultActorJson);
		expect(
			JSON.parse(readFileSync(joinPath(getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`), 'utf8')),
		).toStrictEqual({ url: 'https://www.apify.com/' });
	});

	it('correctly creates config with dockerfile when provided', async () => {
		const dockerfilePath = './Dockerfile';
		await testRunCommand(InitCommand, {
			args_actorName: actName,
			flags_yes: true,
			flags_dockerfile: dockerfilePath,
		});

		const config = JSON.parse(readFileSync(joinPath(LOCAL_CONFIG_PATH), 'utf8'));
		expect(config).toMatchObject({
			...EMPTY_LOCAL_CONFIG,
			name: actName,
			dockerfile: dockerfilePath,
		});
	});

	it('correctly creates config without dockerfile when not provided', async () => {
		await testRunCommand(InitCommand, {
			args_actorName: actName,
			flags_yes: true,
		});

		const config = JSON.parse(readFileSync(joinPath(LOCAL_CONFIG_PATH), 'utf8'));
		expect(config).toStrictEqual(Object.assign(EMPTY_LOCAL_CONFIG, { name: actName }));
		expect(config.dockerfile).toBeUndefined();
	});

	it('warns when a Python project has no Dockerfile', async () => {
		await mkdir(joinPath('my_actor'), { recursive: true });
		writeFileSync(joinPath('my_actor', '__init__.py'), '');
		writeFileSync(joinPath('my_actor', '__main__.py'), '');

		await testRunCommand(InitCommand, { args_actorName: actName, flags_yes: true });

		expect(logMessages.error.join('\n')).toMatch(/No Dockerfile found/);
	});

	it('does not warn when a Python project has a Dockerfile', async () => {
		await mkdir(joinPath('my_actor'), { recursive: true });
		writeFileSync(joinPath('my_actor', '__init__.py'), '');
		writeFileSync(joinPath('my_actor', '__main__.py'), '');
		writeFileSync(joinPath('Dockerfile'), 'FROM apify/actor-python');

		await testRunCommand(InitCommand, { args_actorName: actName, flags_yes: true });

		expect(logMessages.error.join('\n')).not.toMatch(/No Dockerfile found/);
	});
});
