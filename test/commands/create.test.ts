import { existsSync, readFileSync } from 'node:fs';

import { KEY_VALUE_STORE_KEYS } from '@apify/consts';

import { runCommand } from '../../src/lib/command-framework/apify-command.js';
import { LOCAL_CONFIG_PATH } from '../../src/lib/consts.js';
import { getLocalKeyValueStorePath } from '../../src/lib/utils.js';
import { useConsoleSpy } from '../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../__setup__/hooks/useTempPath.js';

const actName = 'create-my-actor';
const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath, tmpPath } = useTempPath(actName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: true,
});

const { lastErrorMessage } = useConsoleSpy();

const { CreateCommand } = await import('../../src/commands/create.js');

describe('apify create', () => {
	beforeEach(async () => {
		await beforeAllCalls();
	});

	afterEach(async () => {
		await afterAllCalls();
	});

	['a'.repeat(151), 'sh', 'bad_escaped'].forEach((badActorName) => {
		it(`returns error with bad Actor name ${badActorName}`, async () => {
			await runCommand(CreateCommand, { args_actorName: badActorName });

			expect(lastErrorMessage()).toMatch(/the actor name/i);
		});
	});

	it('basic template structure with empty INPUT.json', async () => {
		const ACT_TEMPLATE = 'project_empty';
		const expectedInput = {};

		await runCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: ACT_TEMPLATE,
			flags_skipDependencyInstall: true,
		});

		// check files structure
		expect(existsSync(tmpPath)).toBeTruthy();

		toggleCwdBetweenFullAndParentPath();

		// Check that create command won't create the deprecated apify.json file
		// TODO: we can remove this later
		const apifyJsonPath = joinPath('apify.json');
		const actorJsonPath = joinPath(LOCAL_CONFIG_PATH);

		expect(existsSync(joinPath('package.json'))).toBeTruthy();
		expect(existsSync(apifyJsonPath)).toBeFalsy();
		expect(existsSync(actorJsonPath)).toBeTruthy();
		expect(JSON.parse(readFileSync(actorJsonPath, 'utf8')).name).to.be.eql(actName);
		expect(
			JSON.parse(
				readFileSync(joinPath(getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`), 'utf8'),
			),
		).to.be.eql(expectedInput);
	});

	it('basic template structure with prefilled INPUT.json', async () => {
		const ACT_TEMPLATE = 'getting_started_typescript';
		const expectedInput = { url: 'https://www.apify.com' };

		await runCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: ACT_TEMPLATE,
			flags_skipDependencyInstall: true,
		});

		// check files structure
		expect(existsSync(tmpPath)).toBeTruthy();

		toggleCwdBetweenFullAndParentPath();

		// Check that create command won't create the deprecated apify.json file
		// TODO: we can remove this later
		const apifyJsonPath = joinPath('apify.json');
		const actorJsonPath = joinPath(LOCAL_CONFIG_PATH);

		expect(existsSync(joinPath('package.json'))).toBeTruthy();
		expect(existsSync(apifyJsonPath)).toBeFalsy();
		expect(existsSync(actorJsonPath)).toBeTruthy();
		expect(JSON.parse(readFileSync(actorJsonPath, 'utf8')).name).to.be.eql(actName);
		expect(
			JSON.parse(
				readFileSync(joinPath(getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`), 'utf8'),
			),
		).to.be.eql(expectedInput);
	});

	it('should skip installing optional dependencies', async () => {
		const ACT_TEMPLATE = 'project_cheerio_crawler_js';

		await runCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: ACT_TEMPLATE,
			flags_omitOptionalDeps: true,
		});

		// check files structure
		expect(existsSync(tmpPath)).toBeTruthy();

		toggleCwdBetweenFullAndParentPath();

		expect(existsSync(joinPath('package.json'))).toBeTruthy();
		expect(existsSync(joinPath('node_modules'))).toBeTruthy();
		expect(existsSync(joinPath('node_modules', 'cheerio'))).toBeTruthy();
		expect(existsSync(joinPath('node_modules', 'playwright'))).toBeFalsy();
	});
});
