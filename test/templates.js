const { expect } = require('chai');
const fs = require('fs');
const sinon = require('sinon');
const command = require('@oclif/command');
const path = require('path');
const { ENV_VARS } = require('apify-shared/consts');
const { spawnSync } = require('child_process');
const { rimrafPromised } = require('../src/lib/files');
const loadJson = require('load-json-file');
const { getLocalKeyValueStorePath, getLocalStorageDir } = require('../src/lib/utils');
const { ACTS_TEMPLATES } = require('../src/lib/consts');

const TEST_ACTORS_FOLDER = 'test-actors';
const APIFY_LATEST_VERSION = spawnSync('npm', ['view', 'apify', 'version']).stdout.toString().trim();

const checkTemplateStructureAndRun = async (actorName, templateName) => {
    const apifyJsonPath = path.join(actorName, 'apify.json');
    // Check files structure
    expect(fs.existsSync(actorName)).to.be.true;
    expect(fs.existsSync(path.join(actorName, 'package.json'))).to.be.true;
    expect(fs.existsSync(apifyJsonPath)).to.be.true;
    expect(fs.existsSync(path.join(actorName, getLocalStorageDir()))).to.be.true;
    expect(fs.existsSync(path.join(actorName, getLocalKeyValueStorePath(), 'INPUT.json'))).to.be.true;
    expect(loadJson.sync(apifyJsonPath).template).to.be.eql(templateName);

    // Check if template has the latest apify package version
    const apifyModulePackageJson = path.join(actorName, 'node_modules', 'apify', 'package.json');
    expect(loadJson.sync(apifyModulePackageJson).version).to.be.eql(APIFY_LATEST_VERSION);

    // Check if actor was created without errors
    expect(console.log.args.map(arg => arg[0])).to.not.include('Error:');

    process.chdir(actorName);
    await command.run(['run']);
    process.chdir('../');

    // Check if actor run without errors
    expect(console.log.args.map(arg => arg[0])).to.not.include('Error:');
};

let prevEnvHeadless;

describe('templates', () => {
    before(async () => {
        prevEnvHeadless = process.env[ENV_VARS.HEADLESS];
        process.env[ENV_VARS.HEADLESS] = '1';

        if (!fs.existsSync(TEST_ACTORS_FOLDER)) fs.mkdirSync(TEST_ACTORS_FOLDER);
        process.chdir(TEST_ACTORS_FOLDER);
    });

    after(async () => {
        process.env[ENV_VARS.HEADLESS] = prevEnvHeadless;

        process.chdir('../');
        if (fs.existsSync(TEST_ACTORS_FOLDER)) await rimrafPromised(TEST_ACTORS_FOLDER);
    });

    beforeEach(() => {
        sinon.spy(console, 'log');
    });

    afterEach(() => {
        console.log.restore();
    });

    it('basic works', async () => {
        const actorName = 'basic-template-actor';
        const templateName = ACTS_TEMPLATES.basic.value;
        await command.run(['create', actorName, '--template', templateName]);

        await checkTemplateStructureAndRun(actorName, templateName);
    });

    it('hello word works', async () => {
        const actorName = 'hello-template-actor';
        const templateName = ACTS_TEMPLATES.hello_word.value;
        await command.run(['create', actorName, '--template', templateName]);

        await checkTemplateStructureAndRun(actorName, templateName);
    });


    it('puppeteer works', async () => {
        const actorName = 'pup-template-actor';
        const templateName = ACTS_TEMPLATES.puppeteer.value;
        await command.run(['create', actorName, '--template', templateName]);

        await checkTemplateStructureAndRun(actorName, templateName);
    });

    it('puppeteer crawler works', async () => {
        const actorName = 'pup-cra-template-actor';
        const templateName = ACTS_TEMPLATES.puppeteer_crawler.value;
        await command.run(['create', actorName, '--template', templateName]);

        await checkTemplateStructureAndRun(actorName, templateName);
    });
});
