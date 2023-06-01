const loadJson = require('load-json-file');
const command = require('@oclif/command');
const sinon = require('sinon');
const path = require('path');
const { expect } = require('chai');
const writeJsonFile = require('write-json-file');
const fs = require('fs');
const { testUserClient, TEST_USER_TOKEN } = require('./config');
const { LOCAL_CONFIG_PATH, DEPRECATED_LOCAL_CONFIG_NAME, GLOBAL_CONFIGS_FOLDER } = require('../../src/lib/consts');

const ACTOR_NAME = `pull-test-${Date.now()}`;
const TEST_ACTOR_SOURCE_FILES = {
    name: ACTOR_NAME,
    isPublic: false,
    versions: [
        {
            versionNumber: '0.0',
            sourceType: 'SOURCE_FILES',
            buildTag: 'latest',
            sourceFiles: [
                {
                    name: '.actor',
                    folder: true,
                },
                {
                    name: '.actor/Dockerfile',
                    format: 'TEXT',
                    content: '# First, specify the base Docker image.\n# You can see the Docker images from Apify at https://hub.docker.com/r/apify/.\n# You can also use any other image from Docker Hub.\nFROM apify/actor-python:3.11\n\n# Second, copy just requirements.txt into the actor image,\n# since it should be the only file that affects the dependency install in the next step,\n# in order to speed up the build\nCOPY requirements.txt ./\n\n# Install the packages specified in requirements.txt,\n# Print the installed Python version, pip version\n# and all installed packages with their versions for debugging\nRUN echo "Python version:" \\\n && python --version \\\n && echo "Pip version:" \\\n && pip --version \\\n && echo "Installing dependencies:" \\\n && pip install -r requirements.txt \\\n && echo "All installed Python packages:" \\\n && pip freeze\n\n# Next, copy the remaining files and directories with the source code.\n# Since we do this after installing the dependencies, quick build will be really fast\n# for most source file changes.\nCOPY . ./\n\n# Specify how to launch the source code of your actor.\n# By default, the "python3 -m src" command is run\nCMD ["python3", "-m", "src"]\n',
                },
                {
                    name: '.actor/actor.json',
                    format: 'TEXT',
                    content:
                        '{"actorSpecification": 1,"name": "","title": "Getting Started with Apify Python SDK","description": "Adds two integers.",'
                        + '"version": "0.0","meta": {"templateId": "python-start"},"dockerfile": "./Dockerfile",'
                        + '"storages": {"dataset": {"actorSpecification": 1,"title": "Numbers and their sums",'
                        + '"views": {"sums": {"title": "A sum of two numbers",'
                        + '"transformation": {"fields": ["sum","first_number","second_number"]},'
                        + '"display": {"component": "table","properties": {"sum": {"label": "Sum","format": "number"},'
                        + '"first_number": {"label": "First number","format": "number"},'
                        + '"second_number": {"label": "Second number","format": "number"}}}}}}}}',
                },
                {
                    name: 'src',
                    folder: true,
                },
                {
                    name: 'src/__init__.py',
                    format: 'TEXT',
                    content: '',
                },
                {
                    name: 'README.md',
                    format: 'TEXT',
                    content: '# Start with Python template\n\nA simple Python example of core Actor and Apify SDK features. It reads and validates user input with schema, computes a result and saves it to storage.\n\n## Getting Started\n\n### Install Apify CLI\n\n#### Using Homebrew\n\n```Bash\nbrew install apify/tap/apify-cli\n```\n\n#### Using NPM\n\n```Bash\nnpm -g install apify-cli\n```\n\n### Create a new Actor using this template\n\n```Bash\napify create my-python-actor -t python-start\n```\n\n### Run the Actor locally\n\n```Bash\ncd my-python-actor\napify run\n```\n\n## Deploy on Apify\n\n### Log in to Apify\n\nYou will need to provide your [Apify API Token](https://console.apify.com/account/integrations) to complete this action.\n\n```Bash\napify login\n```\n\n### Deploy your Actor\n\nThis command will deploy and build the Actor on the Apify Platform. You can find your newly created Actor under [Actors -> My Actors](https://console.apify.com/actors?tab=my).\n\n```Bash\napify push\n```\n\n## Documentation reference\n\nTo learn more about Apify and Actors, take a look at the following resources:\n\n- [Apify SDK for Python documentation](https://docs.apify.com/sdk/python)\n- [Apify Platform documentation](https://docs.apify.com/platform)\n- [Join our developer community on Discord](https://discord.com/invite/jyEM2PRvMU)\n',
                },
                {
                    name: 'requirements.txt',
                    format: 'TEXT',
                    content: '# Add your dependencies here.\n# See https://pip.pypa.io/en/latest/reference/requirements-file-format/\n# for how to format them\napify ~= 1.0.0\n',
                },
            ],
        },
    ],
};

const TEST_ACTOR_GITHUB_GIST = {
    name: ACTOR_NAME,
    isPublic: false,
    versions: [
        {
            versionNumber: '0.0',
            sourceType: 'GITHUB_GIST',
            buildTag: 'latest',
            gitHubGistUrl: 'https://gist.github.com/DennisKallerhoff/32f1efd686e11f6a05f1af87bddb1f1a',
        },
    ],
};

const TEST_ACTOR_GIT_REPO = {
    name: ACTOR_NAME,
    isPublic: false,
    versions: [
        {
            versionNumber: '0.0',
            sourceType: 'GIT_REPO',
            buildTag: 'latest',
            gitRepoUrl: 'https://github.com/HonzaTuron/baidu-scraper#multipage',
        },
    ],
};

const actorIds = [];

describe('apify pull', () => {
    before(async function () {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Skip tests if user used CLI on local, it can break local environment!
            console.warn(`Test was skipped as directory ${GLOBAL_CONFIGS_FOLDER} exists!`);
            this.skip();
            return;
        }
        await command.run(['login', '--token', TEST_USER_TOKEN]);
        process.chdir(ACTOR_NAME);
    });

    beforeEach(() => {
        sinon.spy(console, 'log');
    });

    it('should fail outside actor folder without actorId defined', async () => {
        try {
            await command.run(['pull']);
        } catch (err) {
            expect(err.message).to.be.eql('Cannot find actor in this directory.');
        }
    });

    it('should work with actor SOURCE_FILES', async () => {
        const testActor = await testUserClient.actors().create(TEST_ACTOR_SOURCE_FILES);
        actorIds.push(testActor.id);
        const testActorClient = testUserClient.actor(testActor.id);
        const actorFromServer = await testActorClient.get();

        await command.run(['pull', testActor.id]);

        const actorJson = loadJson.sync(path.join(testActor.name, LOCAL_CONFIG_PATH));

        expect(actorJson.name).to.be.eql(actorFromServer.name);
    });

    it('should work with GITHUB_GIST', async () => {
        const testActor = await testUserClient.actors().create(TEST_ACTOR_GITHUB_GIST);
        actorIds.push(testActor.id);

        await command.run(['pull', testActor.id]);

        const actorPackageJson = loadJson.sync(path.join(testActor.name, 'package.json'));

        expect(actorPackageJson.name).to.be.eql('act-in-gist');
    });

    it('should work with GIT_REPO', async () => {
        const testActor = await testUserClient.actors().create(TEST_ACTOR_GIT_REPO);
        actorIds.push(testActor.id);

        await command.run(['pull', testActor.id]);

        const actorJson = loadJson.sync(path.join(testActor.name, DEPRECATED_LOCAL_CONFIG_NAME));

        expect(actorJson.name).to.be.eql('baidu-scraper');
    });

    it('should work without actor name', async () => {
        const testActor = await testUserClient.actors().create(TEST_ACTOR_SOURCE_FILES);
        actorIds.push(testActor.id);

        const contentBeforeEdit = JSON.parse(TEST_ACTOR_SOURCE_FILES.versions[0].sourceFiles[2].content);
        contentBeforeEdit.name = testActor.name;
        TEST_ACTOR_SOURCE_FILES.versions[0].sourceFiles[2].content = contentBeforeEdit;

        await writeJsonFile(LOCAL_CONFIG_PATH, TEST_ACTOR_SOURCE_FILES.versions[0].sourceFiles[2].content);

        await command.run(['pull']);

        expect(fs.existsSync('src/__init__.py')).to.be.eql(true);
    });

    after(async () => {
        for (const id of actorIds) {
            await testUserClient.actor(id).delete();
        }

        process.chdir('../');
        await command.run(['logout']);
    });
});
