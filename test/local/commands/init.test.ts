import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

import { KEY_VALUE_STORE_KEYS } from '@apify/consts';

import { runCommand } from '../../../src/lib/command-framework/apify-command.js';
import { EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH } from '../../../src/lib/consts.js';
import { getLocalKeyValueStorePath } from '../../../src/lib/utils.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const actName = 'init-my-actor';
const { beforeAllCalls, afterAllCalls, joinPath } = useTempPath(actName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { InitCommand } = await import('../../../src/commands/init.js');

describe('apify init', () => {
	beforeEach(async () => {
		await beforeAllCalls();
	});

	afterEach(async () => {
		await afterAllCalls();
	});

	it('correctly creates basic structure with empty INPUT.json', async () => {
		await runCommand(InitCommand, { args_actorName: actName, flags_yes: true });

		// Check that it won't create deprecated config
		// TODO: We can remove this later
		const apifyJsonPath = 'apify.json';
		expect(existsSync(joinPath(apifyJsonPath))).toBeFalsy();

		expect(JSON.parse(readFileSync(joinPath(LOCAL_CONFIG_PATH), 'utf8'))).toStrictEqual(
			Object.assign(EMPTY_LOCAL_CONFIG, { name: actName }),
		);
		expect(
			JSON.parse(
				readFileSync(joinPath(getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`), 'utf8'),
			),
		).toStrictEqual({});
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

		const defaultActorJson = Object.assign(EMPTY_LOCAL_CONFIG, { name: actName, input });

		await mkdir(joinPath('.actor'), { recursive: true });
		writeFileSync(joinPath(LOCAL_CONFIG_PATH), JSON.stringify(defaultActorJson, null, '\t'), { flag: 'w' });
		await runCommand(InitCommand, { args_actorName: actName, flags_yes: true });

		// Check that it won't create deprecated config
		// TODO: We can remove this later
		const apifyJsonPath = 'apify.json';
		expect(existsSync(joinPath(apifyJsonPath))).toBeFalsy();
		expect(JSON.parse(readFileSync(joinPath(LOCAL_CONFIG_PATH), 'utf8'))).toStrictEqual(defaultActorJson);
		expect(
			JSON.parse(
				readFileSync(joinPath(getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`), 'utf8'),
			),
		).toStrictEqual({ url: 'https://www.apify.com/' });
	});
});
