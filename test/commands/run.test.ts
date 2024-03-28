import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { APIFY_ENV_VARS } from '@apify/consts';
import { loadJsonFileSync } from 'load-json-file';
import { writeJsonFileSync } from 'write-json-file';

import { AUTH_FILE_PATH, EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH } from '../../src/lib/consts.js';
import { rimrafPromised } from '../../src/lib/files.js';
import { getLocalDatasetPath, getLocalKeyValueStorePath, getLocalRequestQueuePath, getLocalStorageDir } from '../../src/lib/utils.js';
import { TEST_USER_TOKEN } from '../__setup__/config.js';
import { useAuthSetup } from '../__setup__/hooks/useAuthSetup.js';
import { useTempPath } from '../__setup__/hooks/useTempPath.js';

const actName = 'run-my-actor';

useAuthSetup({ perTest: true });

const {
    beforeAllCalls,
    afterAllCalls,
    joinPath,
    toggleCwdBetweenFullAndParentPath,
} = useTempPath(actName, { create: true, remove: true, cwd: true, cwdParent: true });

const { CreateCommand } = await import('../../src/commands/create.js');
const { RunCommand } = await import('../../src/commands/run.js');
const { LoginCommand } = await import('../../src/commands/login.js');

describe('apify run', () => {
    beforeAll(async () => {
        await beforeAllCalls();

        await CreateCommand.run([actName, '--template', 'project_empty'], import.meta.url);
        toggleCwdBetweenFullAndParentPath();
    });

    afterAll(async () => {
        await afterAllCalls();
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
        writeFileSync(joinPath('src/main.js'), actCode, { flag: 'w' });

        await RunCommand.run([], import.meta.url);

        // check act output
        const actOutputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT.json');
        const actOutput = loadJsonFileSync(actOutputPath);
        expect(actOutput).toStrictEqual(expectOutput);
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
        writeFileSync(joinPath('src/main.js'), actCode, { flag: 'w' });

        const apifyJson = EMPTY_LOCAL_CONFIG;
        apifyJson.environmentVariables = testEnvVars;
        writeJsonFileSync(joinPath(LOCAL_CONFIG_PATH), apifyJson);

        await RunCommand.run([], import.meta.url);

        const actOutputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT.json');

        const localEnvVars = loadJsonFileSync<Record<typeof APIFY_ENV_VARS[keyof typeof APIFY_ENV_VARS] | 'TEST_LOCAL', string>>(actOutputPath);
        const auth = loadJsonFileSync<{ proxy: { password: string }; id: string; token: string }>(AUTH_FILE_PATH());

        expect(localEnvVars[APIFY_ENV_VARS.PROXY_PASSWORD]).toStrictEqual(auth.proxy.password);
        expect(localEnvVars[APIFY_ENV_VARS.USER_ID]).toStrictEqual(auth.id);
        expect(localEnvVars[APIFY_ENV_VARS.TOKEN]).toStrictEqual(auth.token);
        expect(localEnvVars.TEST_LOCAL).toStrictEqual(testEnvVars.TEST_LOCAL);
    });

    it(`run with env vars from "${LOCAL_CONFIG_PATH}" and custom script`, async () => {
        const testEnvVars = {
            TEST_LOCAL: 'testValue',
        };

        await LoginCommand.run(['--token', TEST_USER_TOKEN], import.meta.url);

        const actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {
            await Actor.setValue('OUTPUT', process.env);
            await Actor.setValue('owo', 'uwu');
            console.log('Done.');
        });
        `;

        writeFileSync(joinPath('src/other.js'), actCode, { flag: 'w' });

        const apifyJson = EMPTY_LOCAL_CONFIG;
        apifyJson.environmentVariables = testEnvVars;
        writeJsonFileSync(joinPath(LOCAL_CONFIG_PATH), apifyJson);

        const pkgJson = readFileSync(joinPath('package.json'), 'utf8');
        const parsedPkgJson = JSON.parse(pkgJson);
        parsedPkgJson.scripts.other = 'node src/other.js';
        writeFileSync(joinPath('package.json'), JSON.stringify(parsedPkgJson, null, 2), { flag: 'w' });

        await RunCommand.run(['-s', 'other'], import.meta.url);

        const actOutputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT.json');

        const localEnvVars = loadJsonFileSync<Record<typeof APIFY_ENV_VARS[keyof typeof APIFY_ENV_VARS] | 'TEST_LOCAL', string>>(actOutputPath);
        const auth = loadJsonFileSync<{ proxy: { password: string }; id: string; token: string }>(AUTH_FILE_PATH());

        expect(localEnvVars[APIFY_ENV_VARS.PROXY_PASSWORD]).toStrictEqual(auth.proxy.password);
        expect(localEnvVars[APIFY_ENV_VARS.USER_ID]).toStrictEqual(auth.id);
        expect(localEnvVars[APIFY_ENV_VARS.TOKEN]).toStrictEqual(auth.token);
        expect(localEnvVars.TEST_LOCAL).toStrictEqual(testEnvVars.TEST_LOCAL);

        const actOutputPath2 = joinPath(getLocalKeyValueStorePath(), 'owo.json');
        const actOutput2 = loadJsonFileSync(actOutputPath2);
        expect(actOutput2).toStrictEqual('uwu');
    });

    it('run purge stores', async () => {
        const input = {
            myInput: 'value',
        };
        const actInputPath = joinPath(getLocalKeyValueStorePath(), 'INPUT.json');
        const testJsonPath = joinPath(getLocalKeyValueStorePath(), 'TEST.json');

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
        writeFileSync(joinPath('src/main.js'), actCode, { flag: 'w' });

        await RunCommand.run([], import.meta.url);

        expect(existsSync(actInputPath)).toStrictEqual(true);
        expect(existsSync(testJsonPath)).toStrictEqual(true);
        expect(existsSync(joinPath(getLocalDatasetPath()))).toStrictEqual(true);
        expect(existsSync(joinPath(getLocalRequestQueuePath()))).toStrictEqual(true);

        actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {});
        `;
        writeFileSync(joinPath('src/main.js'), actCode, { flag: 'w' });

        await RunCommand.run(['--purge'], import.meta.url);

        expect(existsSync(actInputPath)).toStrictEqual(true);
        expect(existsSync(testJsonPath)).toStrictEqual(false);
        expect(existsSync(joinPath(getLocalDatasetPath()))).toStrictEqual(false);
        expect(existsSync(joinPath(getLocalRequestQueuePath()))).toStrictEqual(false);
    });

    it('run with purge works without storage folder', async () => {
        await rimrafPromised(getLocalStorageDir());
        try {
            await RunCommand.run(['--purge'], import.meta.url);
        } catch (err) {
            throw new Error('Can not run actor without storage folder!');
        }
    });
});
