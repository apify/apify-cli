import { readFileSync, writeFileSync } from 'node:fs';
import { access, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import type { ActorCollectionCreateOptions } from 'apify-client';

import { runCommand } from '../../../src/lib/command-framework/apify-command.js';
import { DEPRECATED_LOCAL_CONFIG_NAME, LOCAL_CONFIG_PATH } from '../../../src/lib/consts.js';
import { testUserClient } from '../../__setup__/config.js';
import { safeLogin, useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useProcessMock } from '../../__setup__/hooks/useProcessMock.js';
import { useUniqueId } from '../../__setup__/hooks/useUniqueId.js';

const TEST_ACTOR_SOURCE_FILES: ActorCollectionCreateOptions = {
	isPublic: false,
	versions: [
		{
			versionNumber: '0.0',
			// TODO: vlad, export these enums
			sourceType: 'SOURCE_FILES' as never,
			buildTag: 'latest',
			sourceFiles: [
				{
					name: '.actor',
					// TODO: what? is this not typed correctly?
					folder: true,
				} as never,
				{
					name: '.actor/Dockerfile',
					format: 'TEXT',
					content:
						'# First, specify the base Docker image.\n# You can see the Docker images from Apify at https://hub.docker.com/r/apify/.\n# You can also use any other image from Docker Hub.\nFROM apify/actor-python:3.11\n\n# Second, copy just requirements.txt into the Actor image,\n# since it should be the only file that affects the dependency install in the next step,\n# in order to speed up the build\nCOPY requirements.txt ./\n\n# Install the packages specified in requirements.txt,\n# Print the installed Python version, pip version\n# and all installed packages with their versions for debugging\nRUN echo "Python version:" \\\n && python --version \\\n && echo "Pip version:" \\\n && pip --version \\\n && echo "Installing dependencies:" \\\n && pip install -r requirements.txt \\\n && echo "All installed Python packages:" \\\n && pip freeze\n\n# Next, copy the remaining files and directories with the source code.\n# Since we do this after installing the dependencies, quick build will be really fast\n# for most source file changes.\nCOPY . ./\n\n# Specify how to launch the source code of your Actor.\n# By default, the "python3 -m src" command is run\nCMD ["python3", "-m", "src"]\n',
				},
				{
					name: '.actor/actor.json',
					format: 'TEXT',
					content:
						'{"actorSpecification": 1,"name": "","title": "Getting Started with Apify Python SDK","description": "Adds two integers.",' +
						'"version": "0.0","meta": {"templateId": "python-start"},"dockerfile": "./Dockerfile",' +
						'"storages": {"dataset": {"actorSpecification": 1,"title": "Numbers and their sums",' +
						'"views": {"sums": {"title": "A sum of two numbers",' +
						'"transformation": {"fields": ["sum","first_number","second_number"]},' +
						'"display": {"component": "table","properties": {"sum": {"label": "Sum","format": "number"},' +
						'"first_number": {"label": "First number","format": "number"},' +
						'"second_number": {"label": "Second number","format": "number"}}}}}}}}',
				},
				{
					name: 'src',
					folder: true,
				} as never,
				{
					name: 'src/__init__.py',
					format: 'TEXT',
					content: '',
				},
				{
					name: 'README.md',
					format: 'TEXT',
					content:
						'# Start with Python template\n\nA simple Python example of core Actor and Apify SDK features. It reads and validates user input with schema, computes a result and saves it to storage.\n\n## Getting Started\n\n### Install Apify CLI\n\n#### Using Homebrew\n\n```Bash\nbrew install apify-cli\n```\n\n#### Using NPM\n\n```Bash\nnpm -g install apify-cli\n```\n\n### Create a new Actor using this template\n\n```Bash\napify create my-python-actor -t python-start\n```\n\n### Run the Actor locally\n\n```Bash\ncd my-python-actor\napify run\n```\n\n## Deploy on Apify\n\n### Log in to Apify\n\nYou will need to provide your [Apify API Token](https://console.apify.com/settings/integrations) to complete this action.\n\n```Bash\napify login\n```\n\n### Deploy your Actor\n\nThis command will deploy and build the Actor on the Apify Platform. You can find your newly created Actor under [Actors -> My Actors](https://console.apify.com/actors?tab=my).\n\n```Bash\napify push\n```\n\n## Documentation reference\n\nTo learn more about Apify and Actors, take a look at the following resources:\n\n- [Apify SDK for Python documentation](https://docs.apify.com/sdk/python)\n- [Apify Platform documentation](https://docs.apify.com/platform)\n- [Join our developer community on Discord](https://discord.com/invite/jyEM2PRvMU)\n',
				},
				{
					name: 'requirements.txt',
					format: 'TEXT',
					content:
						'# Add your dependencies here.\n# See https://pip.pypa.io/en/latest/reference/requirements-file-format/\n# for how to format them\napify ~= 1.0.0\n',
				},
			],
		},
	],
};

const TEST_ACTOR_GITHUB_GIST: ActorCollectionCreateOptions = {
	isPublic: false,
	versions: [
		{
			versionNumber: '0.0',
			sourceType: 'GITHUB_GIST' as never,
			buildTag: 'latest',
			gitHubGistUrl: 'https://gist.github.com/DennisKallerhoff/32f1efd686e11f6a05f1af87bddb1f1a',
		},
	],
};

const TEST_ACTOR_GIT_REPO: ActorCollectionCreateOptions = {
	isPublic: false,
	versions: [
		{
			versionNumber: '0.0',
			sourceType: 'GIT_REPO' as never,
			buildTag: 'latest',
			gitRepoUrl: 'https://github.com/HonzaTuron/baidu-scraper#multipage',
		},
	],
};

useAuthSetup({ perTest: false });

const originalCwd = join(process.cwd(), 'test', 'tmp');
let cwd: string = originalCwd;

function setProcessCwd(newCwd: string) {
	cwd = newCwd;
}

useProcessMock({ cwdMock: () => cwd });

const { lastErrorMessage } = useConsoleSpy();

const { ActorsPullCommand } = await import('../../../src/commands/actors/pull.js');

describe('[api] apify pull', () => {
	const actorsForCleanup = new Set<string>();
	const actorNamesForCleanup = new Set<string>();

	beforeAll(async () => {
		await safeLogin();
	});

	afterAll(async () => {
		for (const id of actorsForCleanup) {
			await testUserClient.actor(id).delete();
		}

		for (const name of actorNamesForCleanup) {
			await rm(join(originalCwd, name), { recursive: true, force: true });
		}
	});

	it('should fail outside Actor folder without actorId defined', async () => {
		await runCommand(ActorsPullCommand, {});

		expect(lastErrorMessage()).toMatch(/Cannot find Actor in this directory/i);
	});

	it('should work with Actor SOURCE_FILES', async () => {
		const testActor = await testUserClient
			.actors()
			.create({ name: useUniqueId('pull-test-source-files'), ...TEST_ACTOR_SOURCE_FILES });
		actorsForCleanup.add(testActor.id);
		actorNamesForCleanup.add(testActor.name);

		const testActorClient = testUserClient.actor(testActor.id);
		const actorFromServer = await testActorClient.get();

		await runCommand(ActorsPullCommand, { args_actorId: testActor.id });

		const actorJson = JSON.parse(readFileSync(join(originalCwd, testActor.name, LOCAL_CONFIG_PATH), 'utf8'));

		expect(actorJson.name).to.be.eql(actorFromServer!.name);
	});

	it('should work with GITHUB_GIST', async () => {
		const testActor = await testUserClient
			.actors()
			.create({ name: useUniqueId('pull-test-github-gist'), ...TEST_ACTOR_GITHUB_GIST });
		actorsForCleanup.add(testActor.id);
		actorNamesForCleanup.add(testActor.name);

		await runCommand(ActorsPullCommand, { args_actorId: testActor.id });

		const actorPackageJson = JSON.parse(readFileSync(join(originalCwd, testActor.name, 'package.json'), 'utf8'));

		expect(actorPackageJson.name).to.be.eql('act-in-gist');
	});

	it('should work with GIT_REPO', async () => {
		const testActor = await testUserClient
			.actors()
			.create({ name: useUniqueId('pull-test-git-repo'), ...TEST_ACTOR_GIT_REPO });

		actorsForCleanup.add(testActor.id);
		actorNamesForCleanup.add(testActor.name);

		await runCommand(ActorsPullCommand, { args_actorId: testActor.id });

		const actorJson = JSON.parse(
			readFileSync(join(originalCwd, testActor.name, DEPRECATED_LOCAL_CONFIG_NAME), 'utf8'),
		);

		expect(actorJson.name).to.be.eql('baidu-scraper');
	});

	it('should work without actor name', async () => {
		const testActor = await testUserClient
			.actors()
			.create({ name: useUniqueId('pull-test-no-name'), ...TEST_ACTOR_SOURCE_FILES });

		actorsForCleanup.add(testActor.id);
		actorNamesForCleanup.add('pull-test-no-name');

		const contentBeforeEdit = JSON.parse((TEST_ACTOR_SOURCE_FILES.versions![0] as any).sourceFiles[2].content);
		contentBeforeEdit.name = testActor.name;
		(TEST_ACTOR_SOURCE_FILES.versions![0] as any).sourceFiles[2].content = JSON.stringify(
			contentBeforeEdit,
			null,
			'\t',
		);

		await mkdir(join(originalCwd, 'pull-test-no-name', '.actor'), { recursive: true });

		writeFileSync(
			join(originalCwd, 'pull-test-no-name', LOCAL_CONFIG_PATH),
			(TEST_ACTOR_SOURCE_FILES.versions![0] as any).sourceFiles[2].content,
		);

		setProcessCwd(join(cwd, 'pull-test-no-name'));
		await runCommand(ActorsPullCommand, {});

		await setTimeout(500);

		const exists = await access(join(originalCwd, 'pull-test-no-name', 'src', '__init__.py'))
			.then(() => true)
			.catch(() => false);

		expect(exists).to.be.eql(true);
	});
});
