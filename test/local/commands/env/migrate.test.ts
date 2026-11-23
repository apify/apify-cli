import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import process from 'node:process';

import { EnvMigrateCommand } from '../../../../src/commands/env/migrate.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { SECRETS_FILE_PATH } from '../../../../src/lib/consts.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';
import { useIsolatedGit } from '../../../__setup__/hooks/useIsolatedGit.js';

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

// Taken before useIsolatedGit points HOME elsewhere, to make sure no test writes the developer's own secrets.
const REAL_APIFY_DIR = join(homedir(), '.apify');

useIsolatedGit('env-migrate-test-git-home');

const SECRET_VALUE = 's3cr3t-sentinel';
const PLAIN_VALUE = 'pl41n sentinel';
const LOCAL_VALUE = 'l0cal-sentinel';

const { logMessages } = useConsoleSpy();

let actorDir: string;
let originalExitCode: typeof process.exitCode;

const actorJsonPath = () => join(actorDir, '.actor', 'actor.json');
const dotEnvPath = () => join(actorDir, '.env');
const readActorJson = () => readFileSync(actorJsonPath(), 'utf8');
const writeActorJson = (content: string) => writeFileSync(actorJsonPath(), content);
const readDotEnvFile = () => readFileSync(dotEnvPath(), 'utf8');
const readGitignore = () => readFileSync(join(actorDir, '.gitignore'), 'utf8');
const writeSecrets = (secrets: Record<string, string>) => {
	mkdirSync(dirname(SECRETS_FILE_PATH()), { recursive: true });
	writeFileSync(SECRETS_FILE_PATH(), JSON.stringify(secrets));
};
const stdout = () => logMessages.log.join('\n');
const stderr = () => logMessages.error.join('\n');

const actorJsonWith = (environmentVariables: unknown) =>
	`${JSON.stringify({ actorSpecification: 1, name: 'my-actor', version: '0.0', environmentVariables }, null, '\t')}\n`;
const actorJsonWithout = () =>
	`${JSON.stringify({ actorSpecification: 1, name: 'my-actor', version: '0.0' }, null, '\t')}\n`;

beforeEach(() => {
	originalExitCode = process.exitCode;
	process.exitCode = undefined;
	yesNoConfirm.mockClear();

	vitest.stubEnv('__APIFY_INTERNAL_TEST_AUTH_PATH__', `env-migrate-${process.pid}`);
	if (SECRETS_FILE_PATH().startsWith(REAL_APIFY_DIR)) {
		throw new Error(`The secrets file isn't sandboxed: ${SECRETS_FILE_PATH()}`);
	}
	rmSync(SECRETS_FILE_PATH(), { force: true });

	actorDir = mkdtempSync(join(tmpdir(), 'env-migrate-test-'));
	mkdirSync(join(actorDir, '.actor'));
	execFileSync('git', ['init', '--quiet'], { cwd: actorDir, stdio: 'ignore' });
});

afterEach(() => {
	rmSync(actorDir, { recursive: true, force: true });
	rmSync(SECRETS_FILE_PATH(), { force: true });
	process.exitCode = originalExitCode;
});

const expectNoValues = (instance?: unknown) => {
	for (const value of [SECRET_VALUE, PLAIN_VALUE, LOCAL_VALUE]) {
		expect(stdout()).not.toContain(value);
		expect(stderr()).not.toContain(value);
		if (instance) {
			expect(JSON.stringify((instance as Record<string, unknown>).telemetryData)).not.toContain(value);
		}
	}
};

describe('apify env migrate', () => {
	it('moves plain values to .env, gitignores it, and removes the block from actor.json', async () => {
		writeActorJson(actorJsonWith({ PLAIN: PLAIN_VALUE, LOG_LEVEL: 'debug' }));

		const instance = await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBeUndefined();
		expect(readDotEnvFile()).toBe(`PLAIN='${PLAIN_VALUE}'\nLOG_LEVEL=debug\n`);
		expect(readGitignore()).toBe('.env\n');
		expect(readActorJson()).toBe(actorJsonWithout());
		expect(stdout()).toContain(`Moving "environmentVariables" from .actor/actor.json to ${dotEnvPath()}:`);
		expect(stdout()).toContain('+ LOG_LEVEL');
		expect(stdout()).toContain('+ PLAIN');
		expect(stdout()).toContain('Adding .env to .gitignore.');
		expect(stdout()).toContain('Moved 2 variables to .env.');
		expect(stderr()).toContain('Added .env to .gitignore.');
		expect(stderr()).toContain('Next step: run apify env push to set these values on the platform.');
		expectNoValues(instance);
	});

	it.skipIf(process.platform === 'win32')('creates .env readable only by its owner', async () => {
		writeActorJson(actorJsonWith({ PLAIN: PLAIN_VALUE }));

		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(statSync(dotEnvPath()).mode & 0o777).toBe(0o600);
	});

	it('resolves @secret references from the local secrets store', async () => {
		writeSecrets({ apiKey: SECRET_VALUE, unused: 'x' });
		writeActorJson(actorJsonWith({ API_KEY: '@apiKey', PLAIN: 'p' }));

		const instance = await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBeUndefined();
		expect(readDotEnvFile()).toBe(`API_KEY=${SECRET_VALUE}\nPLAIN=p\n`);
		expect(stdout()).toContain('+ API_KEY (from secret apiKey)');
		expect(stdout()).toContain('Moved 2 variables to .env.');
		expect(JSON.parse(readFileSync(SECRETS_FILE_PATH(), 'utf8'))).toEqual({ apiKey: SECRET_VALUE, unused: 'x' });
		expectNoValues(instance);
	});

	it('stops on missing secrets, lists them, and changes nothing', async () => {
		writeSecrets({ apiKey: SECRET_VALUE });
		const actorJson = actorJsonWith({ API_KEY: '@apiKey', TOKEN: '@token', OTHER: '@another', PLAIN: 'p' });
		writeActorJson(actorJson);

		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBe(5);
		expect(stderr()).toContain(
			"These secrets aren't in the local secrets store: another, token. Pass --allow-missing-secrets to write their keys empty, then fill in their values in .env.",
		);
		expect(yesNoConfirm).not.toHaveBeenCalled();
		expect(existsSync(dotEnvPath())).toBe(false);
		expect(existsSync(join(actorDir, '.gitignore'))).toBe(false);
		expect(readActorJson()).toBe(actorJson);
		expectNoValues();
	});

	it("stops on names that .env can't hold and changes nothing", async () => {
		const actorJson = actorJsonWith({ 'BAD-NAME': 'x', '1ABC': 'y', PLAIN: 'p' });
		writeActorJson(actorJson);

		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBe(5);
		expect(stderr()).toContain(
			"These names in .actor/actor.json can't be in .env: 1ABC, BAD-NAME. A name in .env can only have letters, digits, and underscores, and can't start with a digit. Rename them, then run the command again.",
		);
		expect(yesNoConfirm).not.toHaveBeenCalled();
		expect(existsSync(dotEnvPath())).toBe(false);
		expect(existsSync(join(actorDir, '.gitignore'))).toBe(false);
		expect(readActorJson()).toBe(actorJson);
	});

	it('writes the keys of missing secrets empty with --allow-missing-secrets', async () => {
		writeActorJson(actorJsonWith({ TOKEN: '@token', PLAIN: 'p' }));

		await testRunCommand(EnvMigrateCommand, {
			flags_dir: actorDir,
			flags_yes: true,
			flags_allowMissingSecrets: true,
		});

		expect(process.exitCode).toBeUndefined();
		expect(readDotEnvFile()).toBe('TOKEN=\nPLAIN=p\n');
		expect(stdout()).toContain("+ TOKEN (empty: secret token isn't in the local secrets store)");
		expect(stderr()).toContain(
			"These secrets aren't in the local secrets store, so their keys are written empty: token. Fill them in .env.",
		);
		expect(readActorJson()).toBe(actorJsonWithout());
	});

	it("doesn't say a missing secret's key is written empty when .env already has the key", async () => {
		writeFileSync(dotEnvPath(), `TOKEN=${LOCAL_VALUE}\n`);
		writeActorJson(actorJsonWith({ TOKEN: '@token', OTHER: '@other' }));

		await testRunCommand(EnvMigrateCommand, {
			flags_dir: actorDir,
			flags_yes: true,
			flags_allowMissingSecrets: true,
		});

		expect(process.exitCode).toBeUndefined();
		expect(readDotEnvFile()).toBe(`TOKEN=${LOCAL_VALUE}\nOTHER=\n`);
		expect(stderr()).toContain(
			"These secrets aren't in the local secrets store, so their keys are written empty: other. Fill them in .env.",
		);
		expect(stderr()).toContain('Kept the .env value of TOKEN; actor.json had a different one.');
		expectNoValues();
	});

	it("doesn't read the secrets store when no value refers to it", async () => {
		mkdirSync(dirname(SECRETS_FILE_PATH()), { recursive: true });
		writeFileSync(SECRETS_FILE_PATH(), '{ not json');
		writeActorJson(actorJsonWith({ PLAIN: 'p' }));

		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBeUndefined();
		expect(readDotEnvFile()).toBe('PLAIN=p\n');
	});

	it('keeps the values already in .env and reports the conflicts', async () => {
		writeFileSync(dotEnvPath(), `# local\nPLAIN=${LOCAL_VALUE}\nSAME=same\n`);
		writeActorJson(actorJsonWith({ PLAIN: PLAIN_VALUE, SAME: 'same', NEW: 'n' }));

		const instance = await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBeUndefined();
		expect(readDotEnvFile()).toBe(`# local\nPLAIN=${LOCAL_VALUE}\nSAME=same\nNEW=n\n`);
		expect(stdout()).toContain('+ NEW');
		expect(stdout()).toContain('= SAME (already in .env)');
		expect(stdout()).toContain('~ PLAIN (.env keeps its value; actor.json has a different one)');
		expect(stderr()).toContain('Kept the .env value of PLAIN; actor.json had a different one.');
		expect(stderr()).not.toContain('Kept the .env value of SAME');
		expect(stdout()).toContain('Moved 1 variable to .env.');
		expect(readActorJson()).toBe(actorJsonWithout());
		expectNoValues(instance);
	});

	it('keeps malformed .env lines and names them only by number', async () => {
		writeFileSync(dotEnvPath(), 'LOCAL=1\nNO_EQUALS_SIGN\nBAD-NAME=bad-value\n');
		writeActorJson(actorJsonWith({ PLAIN: 'p' }));

		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBeUndefined();
		expect(readDotEnvFile()).toBe('LOCAL=1\nNO_EQUALS_SIGN\nBAD-NAME=bad-value\nPLAIN=p\n');
		expect(stderr()).toContain(
			`Skipped 2 malformed lines in ${dotEnvPath()} (lines 2, 3). They stay in .env unchanged.`,
		);
		expect(`${stdout()}\n${stderr()}`).not.toMatch(/NO_EQUALS_SIGN|BAD-NAME|bad-value/);
	});

	it('keeps the comments and tab indentation of actor.json', async () => {
		writeActorJson(
			'{\n\t// The Actor\n\t"actorSpecification": 1,\n\t"name": "my-actor",\n\t"environmentVariables": {\n\t\t"PLAIN": "p", // a value\n\t\t"N": 5\n\t},\n\t"version": "0.0" // tail\n}\n',
		);

		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBeUndefined();
		expect(readActorJson()).toBe(
			'{\n\t// The Actor\n\t"actorSpecification": 1,\n\t"name": "my-actor",\n\t"version": "0.0" // tail\n}\n',
		);
		expect(readDotEnvFile()).toBe('PLAIN=p\nN=5\n');
	});

	it('converts numbers and booleans to strings', async () => {
		writeActorJson(actorJsonWith({ PORT: 8080, RATIO: 0.5, DEBUG: true }));

		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(readDotEnvFile()).toBe('PORT=8080\nRATIO=0.5\nDEBUG=true\n');
	});

	it('leaves a .gitignore that already ignores .env alone', async () => {
		writeFileSync(join(actorDir, '.gitignore'), 'node_modules\n.env\n');
		writeActorJson(actorJsonWith({ PLAIN: 'p' }));

		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(readGitignore()).toBe('node_modules\n.env\n');
		expect(stdout()).not.toContain('Adding .env to .gitignore.');
		expect(stderr()).not.toContain('Added .env to .gitignore.');
	});

	it('warns when Git already tracks .env', async () => {
		writeFileSync(dotEnvPath(), 'LOCAL=1\n');
		execFileSync('git', ['add', '.env'], { cwd: actorDir, stdio: 'ignore' });
		writeActorJson(actorJsonWith({ PLAIN: 'p' }));

		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(stderr()).toContain(".env is tracked by Git, so .gitignore doesn't keep it out of commits.");
	});

	it('resolves a relative --dir against the current directory', async () => {
		writeActorJson(actorJsonWith({ PLAIN: 'p' }));
		vitest.spyOn(process, 'cwd').mockReturnValue(dirname(actorDir));

		await testRunCommand(EnvMigrateCommand, { flags_dir: basename(actorDir), flags_yes: true });

		expect(process.exitCode).toBeUndefined();
		expect(readDotEnvFile()).toBe('PLAIN=p\n');
		expect(readActorJson()).toBe(actorJsonWithout());
	});

	it('fails for a --dir that does not exist', async () => {
		await testRunCommand(EnvMigrateCommand, { flags_dir: join(actorDir, 'missing'), flags_yes: true });

		expect(process.exitCode).toBe(5);
		expect(stderr()).toContain(`Directory ${join(actorDir, 'missing')} doesn't exist.`);
	});

	it('fails without .actor/actor.json', async () => {
		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBe(5);
		expect(stderr()).toContain(`No .actor/actor.json in ${actorDir}.`);
	});

	it('fails non-interactively without --yes and changes nothing', async () => {
		const actorJson = actorJsonWith({ PLAIN: PLAIN_VALUE });
		writeActorJson(actorJson);

		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBe(1);
		expect(stderr()).toContain(
			'apify env migrate asks before it changes files. To migrate without a prompt, pass --yes.',
		);
		expect(existsSync(dotEnvPath())).toBe(false);
		expect(existsSync(join(actorDir, '.gitignore'))).toBe(false);
		expect(readActorJson()).toBe(actorJson);
	});

	it('changes nothing when the prompt is declined', async () => {
		const actorJson = actorJsonWith({ PLAIN: PLAIN_VALUE });
		writeActorJson(actorJson);
		yesNoConfirm.mockResolvedValueOnce(false);

		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBeUndefined();
		expect(yesNoConfirm).toHaveBeenCalledWith(expect.objectContaining({ message: 'Migrate these variables?' }));
		expect(stderr()).toContain('Nothing was changed.');
		expect(existsSync(dotEnvPath())).toBe(false);
		expect(readActorJson()).toBe(actorJson);
	});

	it('says there is nothing to migrate without environmentVariables', async () => {
		writeActorJson(actorJsonWithout());

		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir });

		expect(process.exitCode).toBeUndefined();
		expect(yesNoConfirm).not.toHaveBeenCalled();
		expect(stderr()).toContain('Nothing to migrate: .actor/actor.json has no "environmentVariables".');
		expect(existsSync(dotEnvPath())).toBe(false);
	});

	it('removes an empty environmentVariables without writing .env', async () => {
		writeActorJson(actorJsonWith({}));

		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBeUndefined();
		expect(existsSync(dotEnvPath())).toBe(false);
		expect(readActorJson()).toBe(actorJsonWithout());
		expect(stdout()).toContain('"environmentVariables" in .actor/actor.json is empty, so no variables move to .env.');
		expect(stdout()).toContain('Moved 0 variables to .env.');
		expect(stderr()).not.toContain('Next step');
	});

	it('fails when environmentVariables is not an object', async () => {
		const actorJson = actorJsonWith(['A']);
		writeActorJson(actorJson);

		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBe(5);
		expect(stderr()).toContain(`"environmentVariables" in .actor/actor.json isn't an object.`);
		expect(readActorJson()).toBe(actorJson);
	});

	it('fails before changing anything when .env is a directory', async () => {
		mkdirSync(dotEnvPath());
		const actorJson = actorJsonWith({ PLAIN: 'p' });
		writeActorJson(actorJson);

		await testRunCommand(EnvMigrateCommand, { flags_dir: actorDir, flags_yes: true });

		expect(process.exitCode).toBe(5);
		expect(stderr()).toContain('is a directory, for example a Python virtual environment.');
		expect(existsSync(join(actorDir, '.gitignore'))).toBe(false);
		expect(readActorJson()).toBe(actorJson);
	});
});
