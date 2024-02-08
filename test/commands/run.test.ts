import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { APIFY_ENV_VARS } from '@apify/consts';
import { loadJsonFileSync } from 'load-json-file';
import { writeJsonFileSync } from 'write-json-file';

import { CreateCommand } from '../../src/commands/create.js';
import { LoginCommand } from '../../src/commands/login.js';
import { LogoutCommand } from '../../src/commands/logout.js';
import { RunCommand } from '../../src/commands/run.js';
import { AUTH_FILE_PATH, EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH } from '../../src/lib/consts.js';
import { rimrafPromised } from '../../src/lib/files.js';
import { getLocalDatasetPath, getLocalKeyValueStorePath, getLocalRequestQueuePath, getLocalStorageDir } from '../../src/lib/utils.js';
import { TEST_USER_TOKEN } from '../__setup__/config.js';

const actName = 'my-act';

describe('apify run', () => {
    let skipAfterHook = false;
    beforeAll(async () => {
        if (existsSync(AUTH_FILE_PATH)) {
            // Tests could break local environment if user is already logged in
            skipAfterHook = true;
            throw new Error(`Cannot run tests, file ${AUTH_FILE_PATH} exists! Run "apify logout" to fix this.`);
        }

        await CreateCommand.run([actName, '--template', 'project_empty'], import.meta.url);
        process.chdir(actName);
    });

    it('run act with output', async () => {
        const expectOutput = {
            my: 'output',
        };
        const actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {
            const input = await Actor.getInput();

            const output = ${JSON.stringify(expectOutput)};
            await Actor.setValue('OUTPUT', output);
            console.log('Done.');
        });
        `;
        writeFileSync('src/main.js', actCode, { flag: 'w' });

        await RunCommand.run([], import.meta.url);

        // check act output
        const actOutputPath = join(getLocalKeyValueStorePath(), 'OUTPUT.json');
        const actOutput = loadJsonFileSync(actOutputPath);
        expect(actOutput).to.be.eql(expectOutput);
    });

    it(`run with env vars from "${LOCAL_CONFIG_PATH}"`, async () => {
        const testEnvVars = {
            TEST_LOCAL: 'testValue',
        };

        await LoginCommand.run(['--token', TEST_USER_TOKEN], import.meta.url);

        const actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {
            await Actor.setValue('OUTPUT', process.env);
            console.log('Done.');
        });
        `;
        writeFileSync('src/main.js', actCode, { flag: 'w' });

        const apifyJson = EMPTY_LOCAL_CONFIG;
        apifyJson.environmentVariables = testEnvVars;
        writeJsonFileSync(LOCAL_CONFIG_PATH, apifyJson);

        await RunCommand.run([], import.meta.url);

        const actOutputPath = join(getLocalKeyValueStorePath(), 'OUTPUT.json');

        const localEnvVars = loadJsonFileSync<Record<typeof APIFY_ENV_VARS[keyof typeof APIFY_ENV_VARS] | 'TEST_LOCAL', string>>(actOutputPath);
        const auth = loadJsonFileSync<{ proxy: { password: string }; id: string; token: string }>(AUTH_FILE_PATH);

        expect(localEnvVars[APIFY_ENV_VARS.PROXY_PASSWORD]).to.be.eql(auth.proxy.password);
        expect(localEnvVars[APIFY_ENV_VARS.USER_ID]).to.be.eql(auth.id);
        expect(localEnvVars[APIFY_ENV_VARS.TOKEN]).to.be.eql(auth.token);
        expect(localEnvVars.TEST_LOCAL).to.be.eql(testEnvVars.TEST_LOCAL);

        await LogoutCommand.run([], import.meta.url);
    });

    it('run purge stores', async () => {
        const input = {
            myInput: 'value',
        };
        const actInputPath = join(getLocalKeyValueStorePath(), 'INPUT.json');
        const testJsonPath = join(getLocalKeyValueStorePath(), 'TEST.json');

        writeJsonFileSync(actInputPath, input);

        let actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {
            await Actor.setValue('TEST', process.env);
            await Actor.pushData({aa: "bb" });
            const requestQueue = await Actor.openRequestQueue();
            await requestQueue.addRequest({ url: 'http://example.com/' });
        });
        `;
        writeFileSync('src/main.js', actCode, { flag: 'w' });

        await RunCommand.run([], import.meta.url);

        expect(existsSync(actInputPath)).to.be.eql(true);
        expect(existsSync(testJsonPath)).to.be.eql(true);
        expect(existsSync(getLocalDatasetPath())).to.be.eql(true);
        expect(existsSync(getLocalRequestQueuePath())).to.be.eql(true);

        actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {});
        `;
        writeFileSync('src/main.js', actCode, { flag: 'w' });

        await RunCommand.run(['--purge'], import.meta.url);

        expect(existsSync(actInputPath)).to.be.eql(true);
        expect(existsSync(testJsonPath)).to.be.eql(false);
        expect(existsSync(getLocalDatasetPath())).to.be.eql(false);
        expect(existsSync(getLocalRequestQueuePath())).to.be.eql(false);
    });

    it('run with purge works without storage folder', async () => {
        await rimrafPromised(getLocalStorageDir());
        try {
            await RunCommand.run(['--purge'], import.meta.url);
        } catch (err) {
            throw new Error('Can not run actor without storage folder!');
        }
    });

    afterAll(async () => {
        if (skipAfterHook) return;
        process.chdir('../');
        if (existsSync(actName)) await rimrafPromised(actName);
        await LogoutCommand.run([], import.meta.url);
    });
});
