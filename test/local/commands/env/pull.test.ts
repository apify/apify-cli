import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { EnvPullCommand } from '../../../../src/commands/env/pull.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useIsolatedGit } from '../../../__setup__/hooks/useIsolatedGit.js';
import { resetCwdCaches } from '../../../__setup__/reset-cwd-caches.js';

vitest.mock('ci-info', async (importOriginal) => ({
	...(await importOriginal<typeof import('ci-info')>()),
	isCI: true,
}));

// Runs the real prompt wrapper by default; a test answers the prompt with `mockResolvedValueOnce`.
const yesNoConfirm = vitest.hoisted(() => vitest.fn());
vitest.mock('../../../../src/lib/hooks/user-confirmations/useYesNoConfirm.js', async (importOriginal) => {
	const original =
		await importOriginal<typeof import('../../../../src/lib/hooks/user-confirmations/useYesNoConfirm.js')>();
	yesNoConfirm.mockImplementation(original.useYesNoConfirm);
	return { useYesNoConfirm: yesNoConfirm };
});

vitest.mock('../../../../src/lib/utils.js', async (importOriginal) => {
	const { envPlatform } = await import('../../../__setup__/env-platform-mock.js');
	return {
		...(await importOriginal<typeof import('../../../../src/lib/utils.js')>()),
		getLoggedClientOrThrow: vitest.fn(async () => envPlatform.client),
		getCurrentUserInfo: vitest.fn(async () => envPlatform.state.user),
	};
});

const { envPlatform } = await import('../../../__setup__/env-platform-mock.js');

useIsolatedGit('env-pull-test-git-home');

const SECRET_VALUE = 's3cr3t-sentinel';
const LOCAL_SECRET_VALUE = 'l0cal-s3cr3t-sentinel';
const PLAIN_VALUE = 'pl41n sentinel';

const { logMessages } = useConsoleSpy();

let actorDir: string;
let originalExitCode: typeof process.exitCode;

const dotEnvPath = () => join(actorDir, '.env');
const readDotEnvFile = () => readFileSync(dotEnvPath(), 'utf8');
const writeDotEnvFile = (content: string) => writeFileSync(dotEnvPath(), content);
const readGitignore = () => readFileSync(join(actorDir, '.gitignore'), 'utf8');
const stdout = () => logMessages.log.join('\n');
const stderr = () => logMessages.error.join('\n');

beforeEach(() => {
	originalExitCode = process.exitCode;
	process.exitCode = undefined;
	resetCwdCaches();
	yesNoConfirm.mockClear();
	envPlatform.reset();
	envPlatform.state.actors.push({
		id: 'actor-1',
		username: 'tester',
		name: 'my-actor',
		versions: [
			{
				versionNumber: '0.0',
				envVars: [
					{ name: 'PLAIN', value: PLAIN_VALUE, isSecret: false },
					{ name: 'API_KEY', value: SECRET_VALUE, isSecret: true },
					{ name: 'LOG_LEVEL', value: 'debug', isSecret: false },
				],
			},
			{ versionNumber: '1.0', envVars: [{ name: 'ONLY_PLAIN', value: 'x', isSecret: false }] },
		],
	});

	actorDir = mkdtempSync(join(tmpdir(), 'env-pull-test-'));
	mkdirSync(join(actorDir, '.actor'));
	writeFileSync(join(actorDir, '.actor', 'actor.json'), JSON.stringify({ actorSpecification: 1, name: 'my-actor' }));
	execFileSync('git', ['init', '--quiet'], { cwd: actorDir, stdio: 'ignore' });
});

afterEach(() => {
	rmSync(actorDir, { recursive: true, force: true });
	process.exitCode = originalExitCode;
});

const expectNoSecretValues = (instance: unknown) => {
	for (const value of [SECRET_VALUE, LOCAL_SECRET_VALUE, PLAIN_VALUE]) {
		expect(stdout()).not.toContain(value);
		expect(stderr()).not.toContain(value);
		expect(JSON.stringify((instance as Record<string, unknown>).telemetryData)).not.toContain(value);
	}
};

describe('apify env pull', () => {
	it('writes a new .env with plain values and empty secrets, in platform order, without a prompt', async () => {
		const instance = await testRunCommand(EnvPullCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBeUndefined();
		expect(yesNoConfirm).not.toHaveBeenCalled();
		expect(readDotEnvFile()).toBe(`PLAIN='${PLAIN_VALUE}'\nAPI_KEY=\nLOG_LEVEL=debug\n`);
		expect(stdout()).toContain(`Wrote 3 variables from tester/my-actor version 0.0 to ${dotEnvPath()}.`);
		expect(stderr()).toContain('Added .env to .gitignore.');
		expect(stderr()).toContain(
			"Secret values can't be read back, so these keys are empty in .env: API_KEY. apify env push skips empty keys.",
		);
		expect(readGitignore()).toBe('.env\n');
		expectNoSecretValues(instance);
	});

	it.skipIf(process.platform === 'win32')('creates .env readable only by its owner', async () => {
		await testRunCommand(EnvPullCommand, { flags_dir: actorDir });

		expect(statSync(dotEnvPath()).mode & 0o777).toBe(0o600);
	});

	it('merges into an existing .env: updates plain values, keeps local secrets, local-only keys, and comments', async () => {
		writeDotEnvFile(`# my settings\nLOG_LEVEL=info\nAPI_KEY=${LOCAL_SECRET_VALUE}\n\nLOCAL_ONLY=keep-me\n`);

		const instance = await testRunCommand(EnvPullCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBeUndefined();
		expect(readDotEnvFile()).toBe(
			`# my settings\nLOG_LEVEL=debug\nAPI_KEY=${LOCAL_SECRET_VALUE}\n\nLOCAL_ONLY=keep-me\nPLAIN='${PLAIN_VALUE}'\n`,
		);
		expect(stdout()).toContain(`Changes to ${dotEnvPath()}:`);
		expect(stdout()).toContain('~ LOG_LEVEL (local value replaced)');
		expect(stdout()).toContain('+ PLAIN');
		expect(stdout()).not.toContain('API_KEY');
		expect(stdout()).toContain('Wrote 2 variables');
		expect(stderr()).not.toContain('Secret values');
		expectNoSecretValues(instance);
	});

	it('writes the key of a secret that is missing locally empty and lists it', async () => {
		writeDotEnvFile('PLAIN=old\n');

		await testRunCommand(EnvPullCommand, { flags_dir: actorDir, flags_yes: true, flags_json: true });

		expect(readDotEnvFile()).toBe(`PLAIN='${PLAIN_VALUE}'\nAPI_KEY=\nLOG_LEVEL=debug\n`);
		expect(stderr()).toContain('+ API_KEY (secret, empty)');
		expect(JSON.parse(stdout())).toEqual({
			ok: true,
			operation: 'env-pull',
			actor: { id: 'actor-1', name: 'tester/my-actor' },
			version: '0.0',
			path: dotEnvPath(),
			created: false,
			added: ['API_KEY', 'LOG_LEVEL'],
			updated: ['PLAIN'],
			unchanged: [],
			keptLocal: [],
			secretsEmpty: ['API_KEY'],
			gitignoreUpdated: true,
		});
	});

	it('pulls another version without secrets', async () => {
		await testRunCommand(EnvPullCommand, { flags_dir: actorDir, flags_version: '1.0' });

		expect(readDotEnvFile()).toBe('ONLY_PLAIN=x\n');
		expect(stdout()).toContain('Wrote 1 variable from tester/my-actor version 1.0');
		expect(stderr()).not.toContain('Secret values');
	});

	it('writes no .env when the version has no env vars', async () => {
		envPlatform.state.actors[0].versions.push({ versionNumber: '2.0', envVars: [] });

		await testRunCommand(EnvPullCommand, { flags_dir: actorDir, flags_version: '2.0', flags_json: true });

		expect(process.exitCode).toBeUndefined();
		expect(existsSync(dotEnvPath())).toBe(false);
		expect(stderr()).toContain('No env vars on tester/my-actor version 2.0, so no .env was written.');
		expect(JSON.parse(stdout())).toMatchObject({ created: false, added: [], secretsEmpty: [] });
	});

	it('says .env is up to date and writes nothing when nothing changes', async () => {
		const content = `PLAIN='${PLAIN_VALUE}'\nAPI_KEY=\nLOG_LEVEL=debug\n`;
		writeDotEnvFile(content);
		writeFileSync(join(actorDir, '.gitignore'), '.env\n');

		const instance = await testRunCommand(EnvPullCommand, { flags_dir: actorDir, flags_json: true });

		expect(process.exitCode).toBeUndefined();
		expect(yesNoConfirm).not.toHaveBeenCalled();
		expect(readDotEnvFile()).toBe(content);
		expect(stderr()).toContain('.env is already up to date.');
		expect(JSON.parse(stdout())).toMatchObject({
			created: false,
			added: [],
			updated: [],
			unchanged: ['LOG_LEVEL', 'PLAIN'],
			keptLocal: ['API_KEY'],
			secretsEmpty: [],
			gitignoreUpdated: false,
		});
		expectNoSecretValues(instance);
	});

	it('adds .env to .gitignore once, and not when a pattern already ignores it', async () => {
		writeFileSync(join(actorDir, '.gitignore'), 'node_modules\n');

		await testRunCommand(EnvPullCommand, { flags_dir: actorDir });
		await testRunCommand(EnvPullCommand, { flags_dir: actorDir, flags_yes: true });

		expect(readGitignore()).toBe('node_modules\n\n# Added by Apify CLI\n.env\n');

		writeFileSync(join(actorDir, '.gitignore'), '.env*\n');
		rmSync(dotEnvPath());
		logMessages.error.length = 0;

		await testRunCommand(EnvPullCommand, { flags_dir: actorDir });

		expect(readGitignore()).toBe('.env*\n');
		expect(stderr()).not.toContain('Added .env to .gitignore.');
	});

	it('warns when Git tracks .env', async () => {
		writeDotEnvFile('LOG_LEVEL=info\n');
		execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'add', '.env'], {
			cwd: actorDir,
			stdio: 'ignore',
		});

		await testRunCommand(EnvPullCommand, { flags_dir: actorDir, flags_yes: true });

		expect(stderr()).toContain(".env is tracked by Git, so .gitignore doesn't keep it out of commits.");
	});

	it('fails without --yes when there is no terminal and leaves .env and .gitignore as they were', async () => {
		writeDotEnvFile('LOG_LEVEL=info\n');

		const instance = await testRunCommand(EnvPullCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBe(1);
		expect(stderr()).toContain('To update it without a prompt, pass --yes.');
		expect(readDotEnvFile()).toBe('LOG_LEVEL=info\n');
		expect(existsSync(join(actorDir, '.gitignore'))).toBe(false);
		expectNoSecretValues(instance);
	});

	it('asks before it changes an existing .env and changes nothing when declined', async () => {
		writeDotEnvFile('LOG_LEVEL=info\n');
		yesNoConfirm.mockResolvedValueOnce(false);

		await testRunCommand(EnvPullCommand, { flags_dir: actorDir });

		expect(yesNoConfirm).toHaveBeenCalledWith(
			expect.objectContaining({ message: `Update ${dotEnvPath()}?`, default: false }),
		);
		expect(readDotEnvFile()).toBe('LOG_LEVEL=info\n');
		expect(existsSync(join(actorDir, '.gitignore'))).toBe(false);
		expect(stderr()).toContain('Nothing was changed.');
		expect(process.exitCode).toBeUndefined();
	});

	it('prints only JSON on stdout with --json, listing names and never values', async () => {
		const instance = await testRunCommand(EnvPullCommand, { flags_dir: actorDir, flags_json: true });

		expect(JSON.parse(stdout())).toEqual({
			ok: true,
			operation: 'env-pull',
			actor: { id: 'actor-1', name: 'tester/my-actor' },
			version: '0.0',
			path: dotEnvPath(),
			created: true,
			added: ['API_KEY', 'LOG_LEVEL', 'PLAIN'],
			updated: [],
			unchanged: [],
			keptLocal: [],
			secretsEmpty: ['API_KEY'],
			gitignoreUpdated: true,
		});
		expectNoSecretValues(instance);
	});

	it('keeps malformed .env lines and names them only by number', async () => {
		writeDotEnvFile('PLAIN=old\nNO_EQUALS_SIGN\nBAD-NAME=bad-value\n');

		await testRunCommand(EnvPullCommand, { flags_dir: actorDir, flags_yes: true, flags_json: true });

		expect(process.exitCode).toBeUndefined();
		expect(readDotEnvFile()).toBe(
			`PLAIN='${PLAIN_VALUE}'\nNO_EQUALS_SIGN\nBAD-NAME=bad-value\nAPI_KEY=\nLOG_LEVEL=debug\n`,
		);
		expect(stderr()).toContain(
			`Skipped 2 malformed lines in ${dotEnvPath()} (lines 2, 3). They stay in .env unchanged.`,
		);
		expect(`${stdout()}\n${stderr()}`).not.toMatch(/NO_EQUALS_SIGN|BAD-NAME|bad-value/);
	});

	it("skips platform variables whose name can't be in .env and names them", async () => {
		envPlatform.state.actors[0].versions[0].envVars.push(
			{ name: 'BAD-NAME', value: 'x', isSecret: false },
			{ name: '1ABC', value: 'y', isSecret: true },
		);

		await testRunCommand(EnvPullCommand, { flags_dir: actorDir, flags_json: true });

		expect(process.exitCode).toBeUndefined();
		expect(readDotEnvFile()).toBe(`PLAIN='${PLAIN_VALUE}'\nAPI_KEY=\nLOG_LEVEL=debug\n`);
		expect(stderr()).toContain(
			"Skipped BAD-NAME, 1ABC: a name in .env can only have letters, digits, and underscores, and can't start with a digit.",
		);
		expect(JSON.parse(stdout())).toMatchObject({ added: ['API_KEY', 'LOG_LEVEL', 'PLAIN'], secretsEmpty: ['API_KEY'] });
	});

	it('escapes control characters in the names it skips', async () => {
		envPlatform.state.actors[0].versions[0].envVars.push({
			name: 'X\u001b]52;c;cHduZWQ=\u0007',
			value: 'x',
			isSecret: false,
		});

		await testRunCommand(EnvPullCommand, { flags_dir: actorDir, flags_yes: true });

		expect(stderr()).toContain('Skipped X\\x1b]52;c;cHduZWQ=\\x07: a name in .env can only have');
		for (const raw of ['\u001b]52', '\u0007']) expect(`${stdout()}\n${stderr()}`).not.toContain(raw);
	});

	describe("with platform values that .env can't hold", () => {
		const CERT_BODY = 'MIIcrlfcertbody';
		const NUL_VALUE = 'nul-s3cr3t\0tail';

		beforeEach(() => {
			envPlatform.state.actors[0].versions[0].envVars.push(
				{
					name: 'TLS_CERT',
					value: `-----BEGIN CERTIFICATE-----\r\n${CERT_BODY}\r\n-----END CERTIFICATE-----`,
					isSecret: false,
				},
				{ name: 'DB_PASSWORD', value: NUL_VALUE, isSecret: false },
			);
		});

		const expectNoSkippedValues = () => {
			for (const value of [CERT_BODY, 'nul-s3cr3t']) expect(`${stdout()}\n${stderr()}`).not.toContain(value);
		};

		it('skips them with a reason by name and still writes the other variables', async () => {
			writeDotEnvFile('LOCAL_ONLY=keep-me\n');

			await testRunCommand(EnvPullCommand, { flags_dir: actorDir, flags_yes: true, flags_json: true });

			expect(process.exitCode).toBeUndefined();
			expect(readDotEnvFile()).toBe(`LOCAL_ONLY=keep-me\nPLAIN='${PLAIN_VALUE}'\nAPI_KEY=\nLOG_LEVEL=debug\n`);
			expect(stderr()).toContain(
				"Skipped the value of TLS_CERT: it has a carriage return, as in Windows line endings, which .env can't hold.",
			);
			expect(stderr()).toContain("Skipped the value of DB_PASSWORD: it has a NUL character, which .env can't hold.");
			expect(JSON.parse(stdout())).toMatchObject({ added: ['API_KEY', 'LOG_LEVEL', 'PLAIN'], updated: [] });
			expectNoSkippedValues();
		});

		it('keeps the local value of a variable whose platform value it skips', async () => {
			const content = `PLAIN='${PLAIN_VALUE}'\nAPI_KEY=\nLOG_LEVEL=debug\nTLS_CERT=local-cert\n`;
			writeDotEnvFile(content);

			await testRunCommand(EnvPullCommand, { flags_dir: actorDir, flags_yes: true });

			expect(process.exitCode).toBeUndefined();
			expect(readDotEnvFile()).toBe(content);
			expect(stderr()).toContain('Skipped the value of TLS_CERT');
			expect(stderr()).toContain('Nothing else to write to .env.');
			expect(stderr()).not.toContain('already up to date');
			expectNoSkippedValues();
		});

		it('writes no .env when no variable can be written', async () => {
			envPlatform.state.actors[0].versions[0].envVars = envPlatform.state.actors[0].versions[0].envVars.filter(
				({ name }) => name === 'TLS_CERT',
			);

			await testRunCommand(EnvPullCommand, { flags_dir: actorDir, flags_yes: true, flags_json: true });

			expect(process.exitCode).toBeUndefined();
			expect(existsSync(dotEnvPath())).toBe(false);
			expect(stderr()).toContain(
				'None of the env vars on tester/my-actor version 0.0 can be written to .env, so no .env was written.',
			);
			expect(JSON.parse(stdout())).toMatchObject({ created: false, added: [] });
		});
	});

	it('skips a platform variable named __proto__ and writes no .env for it', async () => {
		envPlatform.state.actors[0].versions[1].envVars = [{ name: '__proto__', value: 'proto-value', isSecret: false }];

		await testRunCommand(EnvPullCommand, { flags_dir: actorDir, flags_version: '1.0', flags_json: true });

		expect(process.exitCode).toBeUndefined();
		expect(existsSync(dotEnvPath())).toBe(false);
		expect(stderr()).toContain('Skipped __proto__: a name in .env can only have');
		expect(JSON.parse(stdout())).toMatchObject({ created: false, added: [] });
	});

	it('fails before touching .gitignore when .env is a directory', async () => {
		mkdirSync(join(actorDir, '.env', 'bin'), { recursive: true });

		await testRunCommand(EnvPullCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBe(5);
		expect(stderr()).toContain('is a directory, for example a Python virtual environment.');
		expect(existsSync(join(actorDir, '.gitignore'))).toBe(false);
	});
});
