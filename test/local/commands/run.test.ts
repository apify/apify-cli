import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path/win32';

import { APIFY_ENV_VARS } from '@apify/consts';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { AUTH_FILE_PATH, EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH } from '../../../src/lib/consts.js';
import { rimrafPromised } from '../../../src/lib/files.js';
import {
	getLocalDatasetPath,
	getLocalKeyValueStorePath,
	getLocalRequestQueuePath,
	getLocalStorageDir,
} from '../../../src/lib/utils.js';
import { TEST_TIMEOUT } from '../../__setup__/consts.js';
import { safeLogin, useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';
import {
	defaultsInputSchemaPath,
	missingRequiredPropertyInputSchemaPath,
	prefillsInputSchemaPath,
} from '../../__setup__/input-schemas/paths.js';
import { resetCwdCaches } from '../../__setup__/reset-cwd-caches.js';

const actName = 'run-my-actor';

const INPUT_SCHEMA_ACTOR_SRC = /* js */ `
import { Actor } from 'apify';

Actor.main(async () => {
    const input = await Actor.getInput();

    await Actor.setValue('OUTPUT', input);

    console.log('Done.');
});
`;

useAuthSetup({ perTest: true });

const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath } = useTempPath(actName, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: true,
});

const { lastErrorMessage } = useConsoleSpy();

const { CreateCommand } = await import('../../../src/commands/create.js');
const { RunCommand } = await import('../../../src/commands/run.js');

describe('apify run', () => {
	beforeAll(async () => {
		await beforeAllCalls();

		await testRunCommand(CreateCommand, {
			args_actorName: actName,
			flags_template: 'project_empty',
		});

		toggleCwdBetweenFullAndParentPath();
	}, TEST_TIMEOUT);

	afterAll(async () => {
		await afterAllCalls();
	});

	beforeEach(() => {
		resetCwdCaches();
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

		await testRunCommand(RunCommand, {});

		// check act output
		const actOutputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT.json');
		const actOutput = JSON.parse(readFileSync(actOutputPath, 'utf8'));
		expect(actOutput).toStrictEqual(expectOutput);
	});

	it(`[api] run with env vars from "${LOCAL_CONFIG_PATH}"`, async () => {
		const testEnvVars = {
			TEST_LOCAL: 'testValue',
		};

		await safeLogin();

		const actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {
			console.log(process.env);
            await Actor.setValue('OUTPUT', process.env);
            console.log('Done.');
        });
        `;
		writeFileSync(joinPath('src/main.js'), actCode, { flag: 'w' });

		const apifyJson = EMPTY_LOCAL_CONFIG;
		apifyJson.environmentVariables = testEnvVars;
		writeFileSync(joinPath(LOCAL_CONFIG_PATH), JSON.stringify(apifyJson, null, '\t'), { flag: 'w' });

		await testRunCommand(RunCommand, {});

		const actOutputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT.json');

		const localEnvVars = JSON.parse(readFileSync(actOutputPath, 'utf8'));
		const auth = JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf8'));

		expect(localEnvVars[APIFY_ENV_VARS.PROXY_PASSWORD]).toStrictEqual(auth.proxy.password);
		expect(localEnvVars[APIFY_ENV_VARS.USER_ID]).toStrictEqual(auth.id);
		expect(localEnvVars[APIFY_ENV_VARS.TOKEN]).toStrictEqual(auth.token);
		expect(localEnvVars.TEST_LOCAL).toStrictEqual(testEnvVars.TEST_LOCAL);
	});

	it(`[api] run with env vars from "${LOCAL_CONFIG_PATH}" and custom script`, async () => {
		const testEnvVars = {
			TEST_LOCAL: 'testValue',
		};

		await safeLogin();

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
		writeFileSync(joinPath(LOCAL_CONFIG_PATH), JSON.stringify(apifyJson, null, '\t'), { flag: 'w' });

		const pkgJson = readFileSync(joinPath('package.json'), 'utf8');
		const parsedPkgJson = JSON.parse(pkgJson);
		parsedPkgJson.scripts.other = 'node src/other.js';
		writeFileSync(joinPath('package.json'), JSON.stringify(parsedPkgJson, null, 2), { flag: 'w' });

		await testRunCommand(RunCommand, { flags_entrypoint: 'other' });

		const actOutputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT.json');

		const localEnvVars = JSON.parse(readFileSync(actOutputPath, 'utf8'));
		const auth = JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf8'));

		expect(localEnvVars[APIFY_ENV_VARS.PROXY_PASSWORD]).toStrictEqual(auth.proxy.password);
		expect(localEnvVars[APIFY_ENV_VARS.USER_ID]).toStrictEqual(auth.id);
		expect(localEnvVars[APIFY_ENV_VARS.TOKEN]).toStrictEqual(auth.token);
		expect(localEnvVars.TEST_LOCAL).toStrictEqual(testEnvVars.TEST_LOCAL);

		const actOutputPath2 = joinPath(getLocalKeyValueStorePath(), 'owo.json');
		const actOutput2 = JSON.parse(readFileSync(actOutputPath2, 'utf8'));
		expect(actOutput2).toStrictEqual('uwu');
	});

	it(`[api] run with env vars from "${LOCAL_CONFIG_PATH}" and direct path to script`, async () => {
		const testEnvVars = {
			TEST_LOCAL: 'testValue',
		};

		await safeLogin();

		const actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {
            await Actor.setValue('OUTPUT', process.env);
            await Actor.setValue('two', 'can play');
            console.log('Done.');
        });
        `;

		writeFileSync(joinPath('src/other.js'), actCode, { flag: 'w' });

		const apifyJson = EMPTY_LOCAL_CONFIG;
		apifyJson.environmentVariables = testEnvVars;
		writeFileSync(joinPath(LOCAL_CONFIG_PATH), JSON.stringify(apifyJson, null, '\t'), { flag: 'w' });

		await testRunCommand(RunCommand, { flags_entrypoint: 'src/other.js' });

		const actOutputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT.json');

		const localEnvVars = JSON.parse(readFileSync(actOutputPath, 'utf8'));
		const auth = JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf8'));

		expect(localEnvVars[APIFY_ENV_VARS.PROXY_PASSWORD]).toStrictEqual(auth.proxy.password);
		expect(localEnvVars[APIFY_ENV_VARS.USER_ID]).toStrictEqual(auth.id);
		expect(localEnvVars[APIFY_ENV_VARS.TOKEN]).toStrictEqual(auth.token);
		expect(localEnvVars.TEST_LOCAL).toStrictEqual(testEnvVars.TEST_LOCAL);

		const actOutputPath2 = joinPath(getLocalKeyValueStorePath(), 'two.json');
		const actOutput2 = JSON.parse(readFileSync(actOutputPath2, 'utf8'));
		expect(actOutput2).toStrictEqual('can play');
	});

	it('run purge stores', async () => {
		const input = {
			myInput: 'value',
		};
		const actInputPath = joinPath(getLocalKeyValueStorePath(), 'INPUT.json');
		const testJsonPath = joinPath(getLocalKeyValueStorePath(), 'TEST.json');

		writeFileSync(actInputPath, JSON.stringify(input, null, '\t'), { flag: 'w' });

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

		await testRunCommand(RunCommand, {});

		expect(existsSync(actInputPath)).toStrictEqual(true);
		expect(existsSync(testJsonPath)).toStrictEqual(true);
		expect(existsSync(joinPath(getLocalDatasetPath()))).toStrictEqual(true);
		expect(existsSync(joinPath(getLocalRequestQueuePath()))).toStrictEqual(true);

		actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {});
        `;
		writeFileSync(joinPath('src/main.js'), actCode, { flag: 'w' });

		await testRunCommand(RunCommand, { flags_purge: true });

		expect(existsSync(actInputPath)).toStrictEqual(true);
		expect(existsSync(testJsonPath)).toStrictEqual(false);
		expect(existsSync(joinPath(getLocalDatasetPath()))).toStrictEqual(false);
		expect(existsSync(joinPath(getLocalRequestQueuePath()))).toStrictEqual(false);
	});

	it('run with purge works without storage folder', async () => {
		await rimrafPromised(getLocalStorageDir());

		writeFileSync(
			joinPath('src/main.js'),
			`
import { writeFileSync } from 'node:fs';
writeFileSync(String.raw\`${joinPath('result.txt')}\`, 'hello world');
`,
			{ flag: 'w' },
		);

		await testRunCommand(RunCommand, { flags_purge: true });

		expect(existsSync(joinPath('result.txt'))).toBeTruthy();
	});

	describe('input tests', () => {
		const actPath = joinPath('src/main.js');
		const inputSchemaPath = joinPath('INPUT_SCHEMA.json');
		const inputPath = joinPath(getLocalKeyValueStorePath(), 'INPUT.json');
		const outputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT.json');
		const handPassedInput = JSON.stringify({ awesome: null });

		beforeAll(() => {
			writeFileSync(actPath, INPUT_SCHEMA_ACTOR_SRC, { flag: 'w' });
			mkdirSync(dirname(inputPath), { recursive: true });
		});

		it('throws when required field is not provided', async () => {
			writeFileSync(inputPath, '{}', { flag: 'w' });
			copyFileSync(missingRequiredPropertyInputSchemaPath, inputSchemaPath);

			await testRunCommand(RunCommand, {});

			expect(lastErrorMessage()).toMatch(/Field awesome is required/i);
		});

		it('throws when required field has wrong type', async () => {
			writeFileSync(inputPath, '{"awesome": 42}', { flag: 'w' });
			copyFileSync(defaultsInputSchemaPath, inputSchemaPath);

			await testRunCommand(RunCommand, {});

			expect(lastErrorMessage()).toMatch(/Field awesome must be boolean/i);
		});

		it('throws when passing manual input, but local file has correct input', async () => {
			writeFileSync(inputPath, '{"awesome": true}', { flag: 'w' });
			copyFileSync(defaultsInputSchemaPath, inputSchemaPath);

			await testRunCommand(RunCommand, { flags_input: handPassedInput });

			expect(lastErrorMessage()).toMatch(/Field awesome must be boolean/i);
		});

		it('throws when input has default field of wrong type', async () => {
			writeFileSync(inputPath, '{"awesome": true, "help": 123}', { flag: 'w' });
			copyFileSync(defaultsInputSchemaPath, inputSchemaPath);

			await testRunCommand(RunCommand, {});

			expect(lastErrorMessage()).toMatch(/Field help must be string/i);
		});

		it('throws when input has prefilled field of wrong type', async () => {
			writeFileSync(inputPath, '{"awesome": true, "help": 123}', { flag: 'w' });
			copyFileSync(prefillsInputSchemaPath, inputSchemaPath);

			await testRunCommand(RunCommand, {});

			expect(lastErrorMessage()).toMatch(/Field help must be string/i);
		});

		it('automatically inserts missing defaulted fields', async () => {
			writeFileSync(inputPath, '{"awesome": true}', { flag: 'w' });
			copyFileSync(defaultsInputSchemaPath, inputSchemaPath);

			await testRunCommand(RunCommand, {});

			const output = JSON.parse(readFileSync(outputPath, 'utf8'));
			expect(output).toStrictEqual({ awesome: true, help: 'this_maze_is_not_meant_for_you' });
		});

		it('does not insert missing prefilled fields', async () => {
			writeFileSync(inputPath, '{"awesome": true}', { flag: 'w' });
			copyFileSync(prefillsInputSchemaPath, inputSchemaPath);

			await testRunCommand(RunCommand, {});

			const output = JSON.parse(readFileSync(outputPath, 'utf8'));
			expect(output).toStrictEqual({ awesome: true });
		});
	});
});
