import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';

import { KEY_VALUE_STORE_KEYS } from '@apify/consts';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { LOCAL_CONFIG_PATH } from '../../../src/lib/consts.js';
import { getLocalKeyValueStorePath } from '../../../src/lib/utils.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const actName = 'create-my-actor';
const { beforeAllCalls, afterAllCalls, joinPath, joinCwdPath, toggleCwdBetweenFullAndParentPath, tmpPath } =
	useTempPath(actName, {
		create: true,
		remove: true,
		cwd: true,
		cwdParent: true,
	});

const { lastErrorMessage, logMessages } = useConsoleSpy();

const { CreateCommand } = await import('../../../src/commands/create.js');

describe('apify create', () => {
	beforeEach(async () => {
		await beforeAllCalls();
	});

	afterEach(async () => {
		await afterAllCalls();
	});

	['a'.repeat(151), 'sh', 'bad_escaped'].forEach((badActorName) => {
		it(`returns error with bad Actor name ${badActorName}`, async () => {
			await testRunCommand(CreateCommand, { args_actorName: badActorName });

			expect(lastErrorMessage()).toMatch(/the actor name/i);
		});
	});

	it('basic template structure with empty INPUT.json', async () => {
		const ACT_TEMPLATE = 'project_empty';
		const expectedInput = {};

		await testRunCommand(CreateCommand, {
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
			JSON.parse(readFileSync(joinPath(getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`), 'utf8')),
		).to.be.eql(expectedInput);
	});

	it('basic template structure with prefilled INPUT.json', async () => {
		const ACT_TEMPLATE = 'getting_started_typescript';
		const expectedInput = { url: 'https://www.apify.com' };

		await testRunCommand(CreateCommand, {
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
			JSON.parse(readFileSync(joinPath(getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`), 'utf8')),
		).to.be.eql(expectedInput);
	});

	it('ignores --use-case and --language when --template is provided', async () => {
		// A TypeScript template, deliberately paired with conflicting python/ai filters.
		const ACT_TEMPLATE = 'getting_started_typescript';
		const expectedInput = { url: 'https://www.apify.com' };

		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: ACT_TEMPLATE,
			flags_useCase: 'ai-agent',
			flags_language: 'python',
			flags_skipDependencyInstall: true,
		});

		expect(existsSync(tmpPath)).toBeTruthy();

		toggleCwdBetweenFullAndParentPath();

		const actorJsonPath = joinPath(LOCAL_CONFIG_PATH);

		expect(existsSync(joinPath('package.json'))).toBeTruthy();
		expect(existsSync(actorJsonPath)).toBeTruthy();
		expect(JSON.parse(readFileSync(actorJsonPath, 'utf8')).name).to.be.eql(actName);
		// The TypeScript template's prefilled input proves the --template value was used verbatim,
		// not a template chosen by the (conflicting) --use-case / --language filters.
		expect(
			JSON.parse(readFileSync(joinPath(getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`), 'utf8')),
		).to.be.eql(expectedInput);
	});

	it('prints a machine-readable contract with --json', async () => {
		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: 'project_empty',
			flags_skipDependencyInstall: true,
			flags_skipGitInit: true,
			flags_json: true,
		});

		// Nothing but the payload may reach stdout, otherwise callers cannot parse it.
		expect(logMessages.log).toHaveLength(1);

		const output = JSON.parse(logMessages.log[0]);
		expect(output.source).toBe('apify');
		expect(typeof output.template).toBe('string');
		expect(output.dir.endsWith(actName)).toBe(true);
		expect(output.actorJsonPath.endsWith(LOCAL_CONFIG_PATH)).toBe(true);
		expect(output.nextSteps[0]).toBe(`cd "${actName}"`);
		expect(output.nextSteps).toContain('apify run');
		expect(output.postCreate).toBeNull();
		expect(output.gitRepositoryInitialized).toBe(false);
	});

	it('reports a successful git init in the --json contract', async () => {
		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: 'project_empty',
			flags_skipDependencyInstall: true,
			flags_json: true,
		});

		expect(logMessages.log).toHaveLength(1);
		expect(JSON.parse(logMessages.log[0]).gitRepositoryInitialized).toBe(true);
	});

	it('--json without --template fails before creating the directory', async () => {
		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_skipDependencyInstall: true,
			flags_json: true,
		});

		expect(lastErrorMessage()).toMatch(/--template/);
		expect(logMessages.log).toHaveLength(0);
		expect(existsSync(tmpPath)).toBe(false);
	});

	it('--json without an Actor name fails instead of prompting', async () => {
		await testRunCommand(CreateCommand, {
			flags_template: 'project_empty',
			flags_skipDependencyInstall: true,
			flags_json: true,
		});

		expect(lastErrorMessage()).toMatch(/name/i);
		expect(logMessages.log).toHaveLength(0);
	});

	it('--json reports an existing directory once instead of reprompting', async () => {
		await mkdir(tmpPath, { recursive: true });
		await writeFile(joinPath('placeholder.txt'), '');

		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: 'project_empty',
			flags_skipDependencyInstall: true,
			flags_json: true,
		});

		expect(lastErrorMessage()).toMatch(/already exists/);
		expect(logMessages.log).toHaveLength(0);
	});

	// The Git path validates before it downloads a template or asks the platform for a token, so these
	// need no network. The Actor directory is made before the check, so what has to hold is that it stays
	// empty — nothing to clean up, and a re-run is not blocked by it.
	it('--source github with --skip-git-init fails without scaffolding anything', async () => {
		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: 'project_empty',
			flags_source: 'github',
			flags_skipGitInit: true,
		});

		expect(lastErrorMessage()).toMatch(/--skip-git-init/);
		await expect(readdir(tmpPath)).resolves.toEqual([]);
	});

	it('--source github with --template-archive-url fails without scaffolding anything', async () => {
		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_source: 'github',
			flags_templateArchiveUrl: 'https://example.com/template.zip',
		});

		expect(lastErrorMessage()).toMatch(/--template-archive-url/);
		await expect(readdir(tmpPath)).resolves.toEqual([]);
	});

	// Without a terminal the source step cannot be asked, so it takes the Apify path — which is not what
	// a caller passing --git-repo wanted. Say so instead of creating a plain Actor.
	it('--git-repo without a Git source fails without scaffolding anything', async () => {
		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: 'project_empty',
			flags_gitRepo: 'acme/my-scraper',
		});

		expect(lastErrorMessage()).toMatch(/--git-repo/);
		await expect(readdir(tmpPath)).resolves.toEqual([]);
	});

	it('records the hidden --origin flag in telemetry', async () => {
		const instance = await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: 'project_empty',
			flags_skipDependencyInstall: true,
			flags_skipGitInit: true,
			flags_origin: 'console',
		});

		expect(instance['telemetryData'].create!.origin).toBe('console');
	});

	it('defaults --origin to cli', async () => {
		const instance = await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: 'project_empty',
			flags_skipDependencyInstall: true,
			flags_skipGitInit: true,
		});

		expect(instance['telemetryData'].create!.origin).toBe('cli');
	});

	it('should skip installing optional dependencies', async () => {
		const ACT_TEMPLATE = 'project_cheerio_crawler_js';

		await testRunCommand(CreateCommand, {
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

	it('should initialize git repository by default', async () => {
		const ACT_TEMPLATE = 'project_empty';

		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: ACT_TEMPLATE,
			flags_skipDependencyInstall: true,
		});

		toggleCwdBetweenFullAndParentPath();

		// Check that .git directory exists
		expect(existsSync(joinPath('.git'))).toBeTruthy();
		expect(existsSync(joinPath('.git', 'config'))).toBeTruthy();
	});

	it('should skip git initialization when --skip-git-init flag is used', async () => {
		const ACT_TEMPLATE = 'project_empty';

		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: ACT_TEMPLATE,
			flags_skipDependencyInstall: true,
			flags_skipGitInit: true,
		});

		toggleCwdBetweenFullAndParentPath();

		// Check that .git directory does not exist
		expect(existsSync(joinPath('.git'))).toBeFalsy();
	});

	it('should skip git initialization when run from within an existing git repository', async () => {
		const ACT_TEMPLATE = 'project_empty';

		// Create a .git folder in the parent directory (cwd) to simulate being inside a git repository
		await mkdir(joinCwdPath('.git'), { recursive: true });

		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: ACT_TEMPLATE,
			flags_skipDependencyInstall: true,
		});

		toggleCwdBetweenFullAndParentPath();

		// Check that .git directory does not exist in the newly created actor directory
		expect(existsSync(joinCwdPath('.git'))).toBeFalsy();

		// Cleanup
		toggleCwdBetweenFullAndParentPath();
		await rm(joinCwdPath('.git'), { recursive: true });
	});
});
