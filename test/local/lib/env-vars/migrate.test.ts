import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';

import { SECRETS_FILE_PATH } from '../../../../src/lib/consts.js';
import {
	readActorJsonDocument,
	readLegacySecrets,
	removeEnvironmentVariablesFromActorJson,
	resolveLegacyEnvVars,
} from '../../../../src/lib/env-vars/migrate.js';

let dir: string;
let originalExitCode: typeof process.exitCode;

const actorJsonPath = () => join(dir, '.actor', 'actor.json');
const writeActorJson = (content: string) => writeFileSync(actorJsonPath(), content);

beforeEach(() => {
	originalExitCode = process.exitCode;
	process.exitCode = undefined;
	dir = mkdtempSync(join(tmpdir(), 'env-migrate-lib-'));
	mkdirSync(join(dir, '.actor'));
	// GLOBAL_CONFIGS_FOLDER is <home>/.apify, so the secrets file lands in the temp dir.
	vitest.stubEnv('HOME', join(dir, 'home'));
	vitest.stubEnv('USERPROFILE', join(dir, 'home'));
	vitest.stubEnv('__APIFY_INTERNAL_TEST_AUTH_PATH__', 'env-migrate-lib');
});

afterEach(() => {
	vitest.unstubAllEnvs();
	rmSync(dir, { recursive: true, force: true });
	process.exitCode = originalExitCode;
});

describe('resolveLegacyEnvVars', () => {
	it('resolves references, converts other values with String(), and lists missing secrets', () => {
		const result = resolveLegacyEnvVars(
			{ API_KEY: '@apiKey', TOKEN: '@token', EMPTY_REF: '@empty', PLAIN: 'p', AT: '@', MAIL: 'a@b.c', N: 5, B: false },
			{ apiKey: 'secret', empty: '' },
		);

		expect(result.values).toEqual({
			API_KEY: 'secret',
			TOKEN: '',
			EMPTY_REF: '',
			PLAIN: 'p',
			AT: '@',
			MAIL: 'a@b.c',
			N: '5',
			B: 'false',
		});
		expect(result.missingSecrets).toEqual([
			{ key: 'TOKEN', secretName: 'token' },
			{ key: 'EMPTY_REF', secretName: 'empty' },
		]);
	});

	it("doesn't treat prototype names as stored secrets", () => {
		expect(resolveLegacyEnvVars({ A: '@toString' }, {}).missingSecrets).toEqual([{ key: 'A', secretName: 'toString' }]);
	});
});

describe('readLegacySecrets', () => {
	it('returns an empty object without a secrets file', () => {
		expect(readLegacySecrets()).toEqual({});
	});

	it('returns the string secrets', () => {
		mkdirSync(dirname(SECRETS_FILE_PATH()), { recursive: true });
		writeFileSync(SECRETS_FILE_PATH(), JSON.stringify({ a: 'x', b: 1 }));

		expect(readLegacySecrets()).toEqual({ a: 'x' });
	});

	it('fails on a broken file without printing its content', () => {
		mkdirSync(dirname(SECRETS_FILE_PATH()), { recursive: true });
		writeFileSync(SECRETS_FILE_PATH(), '{"a": "s3cr3t-sentinel" x}');

		expect(() => readLegacySecrets()).toThrow(`${SECRETS_FILE_PATH()} isn't a valid JSON object.`);
		expect(() => readLegacySecrets()).not.toThrow('s3cr3t-sentinel');
		expect(process.exitCode).toBe(5);
	});

	it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
		"fails with the error code when the file can't be read",
		() => {
			mkdirSync(dirname(SECRETS_FILE_PATH()), { recursive: true });
			writeFileSync(SECRETS_FILE_PATH(), '{}');
			chmodSync(SECRETS_FILE_PATH(), 0o000);

			expect(() => readLegacySecrets()).toThrow(new Error(`Couldn't read ${SECRETS_FILE_PATH()} (EACCES).`));
			expect(process.exitCode).toBe(5);
		},
	);
});

describe('readActorJsonDocument', () => {
	it('fails without .actor/actor.json', () => {
		rmSync(join(dir, '.actor'), { recursive: true });

		expect(() => readActorJsonDocument(dir)).toThrow(`No .actor/actor.json in ${dir}.`);
		expect(process.exitCode).toBe(5);
	});

	it('fails on invalid JSON without printing the line', () => {
		writeActorJson('{\n\t"environmentVariables": { "A": "s3cr3t-sentinel" x }\n}\n');

		expect(() => readActorJsonDocument(dir)).toThrow(`${actorJsonPath()} isn't valid JSON:`);
		expect(() => readActorJsonDocument(dir)).not.toThrow('s3cr3t-sentinel');
		expect(process.exitCode).toBe(5);
	});

	it('fails when the file is not an object', () => {
		writeActorJson('[]');

		expect(() => readActorJsonDocument(dir)).toThrow(`${actorJsonPath()} doesn't hold a JSON object.`);
	});

	it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
		"fails with the error code when the file can't be read",
		() => {
			writeActorJson('{}');
			chmodSync(actorJsonPath(), 0o000);

			expect(() => readActorJsonDocument(dir)).toThrow(new Error(`Couldn't read ${actorJsonPath()} (EACCES).`));
			expect(process.exitCode).toBe(5);
		},
	);
});

describe('removeEnvironmentVariablesFromActorJson', () => {
	it('removes the key and keeps comments and formatting', () => {
		writeActorJson(
			'{\n    /* header */\n    "name": "a",\n    "environmentVariables": { "A": "b" },\n    "version": "0.0", // v\n}\n',
		);

		removeEnvironmentVariablesFromActorJson(dir);

		expect(readFileSync(actorJsonPath(), 'utf8')).toBe(
			'{\n    /* header */\n    "name": "a",\n    "version": "0.0", // v\n}\n',
		);
	});

	it('leaves a file without the key untouched', () => {
		const content = '{ "name": "a" }';
		writeActorJson(content);

		removeEnvironmentVariablesFromActorJson(dir);

		expect(readFileSync(actorJsonPath(), 'utf8')).toBe(content);
	});
});
