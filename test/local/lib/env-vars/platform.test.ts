import process from 'node:process';

import type { ApifyClient } from 'apify-client';

import {
	createPlatformEnvVar,
	deletePlatformEnvVar,
	getPlatformEnvVar,
	listPlatformEnvVars,
	updatePlatformEnvVar,
	validateEnvVarName,
	validateEnvVarValue,
} from '../../../../src/lib/env-vars/platform.js';
import type { EnvTarget } from '../../../../src/lib/env-vars/target.js';

const targetWithClient = (client: unknown): EnvTarget => ({
	client: client as ApifyClient,
	actorDir: '/actor',
	actor: { id: 'actor-1', username: 'tester', name: 'my-actor' },
	actorLabel: 'tester/my-actor',
	versionNumber: '0.0',
	versionSource: 'default',
});

const targetListing = (items: Record<string, unknown>[]): EnvTarget =>
	targetWithClient({
		actor: () => ({ version: () => ({ envVars: () => ({ list: async () => ({ total: items.length, items }) }) }) }),
	});

describe('listPlatformEnvVars', () => {
	it('drops the value of a secret even when the API returns one, and keeps the platform order', async () => {
		const envVars = await listPlatformEnvVars(
			targetListing([
				{ name: 'Z_PLAIN', value: 'plain-value', isSecret: false },
				{ name: 'A_SECRET', value: 's3cr3t-sentinel', valueHash: 'hash', isSecret: true },
				{ name: 'NO_TYPE', value: 'v' },
			]),
		);

		expect(envVars).toEqual([
			{ name: 'Z_PLAIN', isSecret: false, value: 'plain-value' },
			{ name: 'A_SECRET', isSecret: true },
			{ name: 'NO_TYPE', isSecret: false, value: 'v' },
		]);
		expect(JSON.stringify(envVars)).not.toContain('s3cr3t-sentinel');
	});

	it('gives a plain variable without a value an empty one', async () => {
		await expect(listPlatformEnvVars(targetListing([{ name: 'EMPTY', isSecret: false }]))).resolves.toEqual([
			{ name: 'EMPTY', isSecret: false, value: '' },
		]);
	});
});

describe('getPlatformEnvVar', () => {
	const targetWith = (item: Record<string, unknown> | undefined) =>
		targetWithClient({ actor: () => ({ version: () => ({ envVar: () => ({ get: async () => item }) }) }) });

	it('drops the value of a secret', async () => {
		await expect(
			getPlatformEnvVar(
				targetWith({ name: 'API_KEY', value: 's3cr3t-sentinel', valueHash: 'hash', isSecret: true }),
				'API_KEY',
			),
		).resolves.toEqual({ name: 'API_KEY', isSecret: true });
	});

	it('keeps the value of a plain variable', async () => {
		await expect(
			getPlatformEnvVar(targetWith({ name: 'LOG_LEVEL', value: 'debug', isSecret: false }), 'LOG_LEVEL'),
		).resolves.toEqual({ name: 'LOG_LEVEL', isSecret: false, value: 'debug' });
	});

	it('returns undefined for a missing variable', async () => {
		await expect(getPlatformEnvVar(targetWith(undefined), 'MISSING')).resolves.toBeUndefined();
	});
});

describe('platform env var writes', () => {
	const calls: { method: string; actorId: string; version: string; name?: string; body?: unknown }[] = [];
	const target = targetWithClient({
		actor: (actorId: string) => ({
			version: (version: string) => ({
				envVars: () => ({ create: async (body: unknown) => calls.push({ method: 'create', actorId, version, body }) }),
				envVar: (name: string) => ({
					update: async (body: unknown) => calls.push({ method: 'update', actorId, version, name, body }),
					delete: async () => calls.push({ method: 'delete', actorId, version, name }),
				}),
			}),
		}),
	});

	beforeEach(() => {
		calls.length = 0;
	});

	it('creates a variable on the target version', async () => {
		await createPlatformEnvVar(target, { name: 'A', value: 'v', isSecret: false });

		expect(calls).toEqual([
			{ method: 'create', actorId: 'actor-1', version: '0.0', body: { name: 'A', value: 'v', isSecret: false } },
		]);
	});

	it('always sends the type on update', async () => {
		await updatePlatformEnvVar(target, { name: 'A', value: 'v', isSecret: false });
		await updatePlatformEnvVar(target, { name: 'A', value: 'v', isSecret: true });

		expect(calls.map(({ body }) => body)).toEqual([
			{ name: 'A', value: 'v', isSecret: false },
			{ name: 'A', value: 'v', isSecret: true },
		]);
		expect(calls[0]).toMatchObject({ method: 'update', actorId: 'actor-1', version: '0.0', name: 'A' });
	});

	it('deletes a variable', async () => {
		await deletePlatformEnvVar(target, 'A');

		expect(calls).toEqual([{ method: 'delete', actorId: 'actor-1', version: '0.0', name: 'A' }]);
	});
});

describe('env var validation', () => {
	let originalExitCode: typeof process.exitCode;

	beforeEach(() => {
		originalExitCode = process.exitCode;
		process.exitCode = undefined;
	});

	afterEach(() => {
		process.exitCode = originalExitCode;
	});

	it.each(['A', 'my-var.1', 'A'.repeat(100)])('accepts the name %s', (name) => {
		expect(() => validateEnvVarName(name)).not.toThrow();
	});

	it.each([
		['an empty name', '', "can't be empty"],
		['a name longer than 100 characters', 'A'.repeat(101), 'at most 100 characters'],
		['a name with "="', 'API_KEY=s3cr3t-sentinel', 'can\'t contain "="'],
	])('rejects %s with exit code 5', (_, name, message) => {
		expect(() => validateEnvVarName(name)).toThrow(message);
		expect(process.exitCode).toBe(5);
	});

	it('does not echo a name that holds "=", which may carry a value', () => {
		expect(() => validateEnvVarName('API_KEY=s3cr3t-sentinel')).toThrow(
			expect.objectContaining({ message: expect.not.stringContaining('s3cr3t-sentinel') }),
		);
	});

	it.each(['x', 'x'.repeat(50_000)])('accepts a value of length %#', (value) => {
		expect(() => validateEnvVarValue('A', value)).not.toThrow();
	});

	it.each([
		['an empty value', '', 'The value of API_KEY is empty.'],
		['a value longer than 50 000 characters', 's3cr3t-sentinel'.repeat(4000), 'longer than 50000 characters'],
	])('rejects %s without printing it', (_, value, message) => {
		expect(() => validateEnvVarValue('API_KEY', value)).toThrow(message);
		expect(process.exitCode).toBe(5);
		expect(() => validateEnvVarValue('API_KEY', value)).toThrow(
			expect.objectContaining({ message: expect.not.stringContaining('s3cr3t-sentinel') }),
		);
	});
});
