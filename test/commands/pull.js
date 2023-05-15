const loadJson = require('load-json-file');
const command = require('@oclif/command');
const sinon = require('sinon');
const path = require('path');
const { expect } = require('chai');
const { testUserClient } = require('./config');
const { LOCAL_CONFIG_PATH } = require('../../src/lib/consts');

const ACTOR_NAME = `pull-test-${Date.now()}`;
const TEST_ACTOR = {
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
                    content: '{\n'
                        + '\t"actorSpecification": 1,\n'
                        + `\t"name": "${ACTOR_NAME}",\n`
                        + '\t"title": "Getting Started with Apify Python SDK",\n'
                        + '\t"description": "Adds two integers.",\n'
                        + '\t"version": "0.0",\n'
                        + '\t"meta": {\n'
                        + '\t\t"templateId": "python-start"\n'
                        + '\t},\n'
                        + '\t"dockerfile": "./Dockerfile",\n'
                        + '\t"storages": {\n'
                        + '\t\t"dataset": {\n'
                        + '\t\t\t"actorSpecification": 1,\n'
                        + '\t\t\t"title": "Numbers and their sums",\n'
                        + '\t\t\t"views": {\n'
                        + '\t\t\t\t"sums": {\n'
                        + '\t\t\t\t\t"title": "A sum of two numbers",\n'
                        + '\t\t\t\t\t"transformation": {\n'
                        + '\t\t\t\t\t\t"fields": [\n'
                        + '\t\t\t\t\t\t\t"sum",\n'
                        + '\t\t\t\t\t\t\t"first_number",\n'
                        + '\t\t\t\t\t\t\t"second_number"\n'
                        + '\t\t\t\t\t\t]\n'
                        + '\t\t\t\t\t},\n'
                        + '\t\t\t\t\t"display": {\n'
                        + '\t\t\t\t\t\t"component": "table",\n'
                        + '\t\t\t\t\t\t"properties": {\n'
                        + '\t\t\t\t\t\t\t"sum": {\n'
                        + '\t\t\t\t\t\t\t\t"label": "Sum",\n'
                        + '\t\t\t\t\t\t\t\t"format": "number"\n'
                        + '\t\t\t\t\t\t\t},\n'
                        + '\t\t\t\t\t\t\t"first_number": {\n'
                        + '\t\t\t\t\t\t\t\t"label": "First number",\n'
                        + '\t\t\t\t\t\t\t\t"format": "number"\n'
                        + '\t\t\t\t\t\t\t},\n'
                        + '\t\t\t\t\t\t\t"second_number": {\n'
                        + '\t\t\t\t\t\t\t\t"label": "Second number",\n'
                        + '\t\t\t\t\t\t\t\t"format": "number"\n'
                        + '\t\t\t\t\t\t\t}\n'
                        + '\t\t\t\t\t\t}\n'
                        + '\t\t\t\t\t}\n'
                        + '\t\t\t\t}\n'
                        + '\t\t\t}\n'
                        + '\t\t}\n'
                        + '\t}\n'
                        + '}\n',
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

describe('apify pull', () => {
    beforeEach(() => {
        sinon.spy(console, 'log');
    });

    it('should work with actor id', async () => {
        const testActor = await testUserClient.actors().create(TEST_ACTOR);
        const testActorClient = testUserClient.actor(testActor.id);
        const actorFromServer = await testActorClient.get();

        await command.run(['pull', testActor.id]);

        const actorJson = loadJson.sync(path.join(testActor.name, LOCAL_CONFIG_PATH));

        expect(actorJson.name).to.be.eql(actorFromServer.name);
    });
});
