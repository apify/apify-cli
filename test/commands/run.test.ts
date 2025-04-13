import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { APIFY_ENV_VARS } from '@apify/consts';
import { captureOutput } from '@oclif/test';

import { AUTH_FILE_PATH, EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH } from '../../src/lib/consts.js';
import { rimrafPromised } from '../../src/lib/files.js';
import {
	getLocalDatasetPath,
	getLocalKeyValueStorePath,
	getLocalRequestQueuePath,
	getLocalStorageDir,
} from '../../src/lib/utils.js';
import { TEST_USER_TOKEN } from '../__setup__/config.js';
import { useAuthSetup } from '../__setup__/hooks/useAuthSetup.js';
import { useTempPath } from '../__setup__/hooks/useTempPath.js';

const actName = 'run-my-actor';
const pathToDefaultsInputSchema = fileURLToPath(new URL('../__setup__/input-schemas/defaults.json', import.meta.url));
const pathToMissingRequiredInputSchema = fileURLToPath(
	new URL('../__setup__/input-schemas/missing-required-property.json', import.meta.url),
);
const pathToPrefillsInputSchema = fileURLToPath(new URL('../__setup__/input-schemas/prefills.json', import.meta.url));

const INPUT_SCHEMA_ACTOR_SRC = `
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
		const actOutput = JSON.parse(readFileSync(actOutputPath, 'utf8'));
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
			console.log(process.env);
            await Actor.setValue('OUTPUT', process.env);
            console.log('Done.');
        });
        `;
		writeFileSync(joinPath('src/main.js'), actCode, { flag: 'w' });

		const apifyJson = EMPTY_LOCAL_CONFIG;
		apifyJson.environmentVariables = testEnvVars;
		writeFileSync(joinPath(LOCAL_CONFIG_PATH), JSON.stringify(apifyJson, null, '\t'), { flag: 'w' });

		await RunCommand.run([], import.meta.url);

		const actOutputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT.json');

		const localEnvVars = JSON.parse(readFileSync(actOutputPath, 'utf8'));
		const auth = JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf8'));

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
		writeFileSync(joinPath(LOCAL_CONFIG_PATH), JSON.stringify(apifyJson, null, '\t'), { flag: 'w' });

		const pkgJson = readFileSync(joinPath('package.json'), 'utf8');
		const parsedPkgJson = JSON.parse(pkgJson);
		parsedPkgJson.scripts.other = 'node src/other.js';
		writeFileSync(joinPath('package.json'), JSON.stringify(parsedPkgJson, null, 2), { flag: 'w' });

		await RunCommand.run(['--entrypoint', 'other'], import.meta.url);

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

	it(`run with env vars from "${LOCAL_CONFIG_PATH}" and direct path to script`, async () => {
		const testEnvVars = {
			TEST_LOCAL: 'testValue',
		};

		await LoginCommand.run(['--token', TEST_USER_TOKEN], import.meta.url);

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

		await RunCommand.run(['--entrypoint', 'src/other.js'], import.meta.url);

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
			throw new Error('Can not run Actor without storage folder!');
		}
	});

	describe('input tests', () => {
		const actPath = joinPath('src/main.js');
		const inputSchemaPath = joinPath('INPUT_SCHEMA.json');
		const inputPath = joinPath(getLocalKeyValueStorePath(), 'INPUT.json');
		const outputPath = joinPath(getLocalKeyValueStorePath(), 'OUTPUT.json');
		const handPassedInput = JSON.stringify({ awesome: null });

		beforeAll(() => {
			writeFileSync(actPath, INPUT_SCHEMA_ACTOR_SRC, { flag: 'w' });
		});

		it('throws when required field is not provided', async () => {
			writeFileSync(inputPath, '{}', { flag: 'w' });
			copyFileSync(pathToMissingRequiredInputSchema, inputSchemaPath);

			const { error } = await captureOutput(async () => RunCommand.run([], import.meta.url));

			expect(error).toBeDefined();
			expect(error!.message).toMatch(/Field awesome is required/i);
		});

		it('throws when required field has wrong type', async () => {
			writeFileSync(inputPath, '{"awesome": 42}', { flag: 'w' });
			copyFileSync(pathToDefaultsInputSchema, inputSchemaPath);

			const { error } = await captureOutput(async () => RunCommand.run([], import.meta.url));

			expect(error).toBeDefined();
			expect(error!.message).toMatch(/Field awesome must be boolean/i);
		});

		it('throws when passing manual input, but local file has correct input', async () => {
			writeFileSync(inputPath, '{"awesome": true}', { flag: 'w' });
			copyFileSync(pathToDefaultsInputSchema, inputSchemaPath);

			const { error } = await captureOutput(async () =>
				RunCommand.run(['--input', handPassedInput], import.meta.url),
			);

			expect(error).toBeDefined();
			expect(error!.message).toMatch(/Field awesome must be boolean/i);
		});

		it('throws when input has default field of wrong type', async () => {
			writeFileSync(inputPath, '{"awesome": true, "help": 123}', { flag: 'w' });
			copyFileSync(pathToDefaultsInputSchema, inputSchemaPath);

			const { error } = await captureOutput(async () => RunCommand.run([], import.meta.url));

			expect(error).toBeDefined();
			expect(error!.message).toMatch(/Field help must be string/i);
		});

		it('throws when input has prefilled field of wrong type', async () => {
			writeFileSync(inputPath, '{"awesome": true, "help": 123}', { flag: 'w' });
			copyFileSync(pathToPrefillsInputSchema, inputSchemaPath);

			const { error } = await captureOutput(async () => RunCommand.run([], import.meta.url));

			expect(error).toBeDefined();
			expect(error!.message).toMatch(/Field help must be string/i);
		});

		it('automatically inserts missing defaulted fields', async () => {
			writeFileSync(inputPath, '{"awesome": true}', { flag: 'w' });
			copyFileSync(pathToDefaultsInputSchema, inputSchemaPath);

			await RunCommand.run([], import.meta.url);

			const output = JSON.parse(readFileSync(outputPath, 'utf8'));
			expect(output).toStrictEqual({ awesome: true, help: 'this_maze_is_not_meant_for_you' });
		});

		it('does not insert missing prefilled fields', async () => {
			writeFileSync(inputPath, '{"awesome": true}', { flag: 'w' });
			copyFileSync(pathToPrefillsInputSchema, inputSchemaPath);

			await RunCommand.run([], import.meta.url);

			const output = JSON.parse(readFileSync(outputPath, 'utf8'));
			expect(output).toStrictEqual({ awesome: true });
		});
	});
});
