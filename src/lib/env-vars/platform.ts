import type { ActorEnvironmentVariable } from 'apify-client';

import { envFail } from './errors.js';
import type { EnvTarget } from './target.js';
import { versionClientFor } from './target.js';

/** What the CLI knows about a platform variable. `value` is set for plain variables only. */
export interface PlatformEnvVar {
	name: string;
	isSecret: boolean;
	value?: string;
}

/** A variable to write. The value goes only into the request body. */
export interface PlatformEnvVarWrite {
	name: string;
	value: string;
	isSecret: boolean;
}

const MAX_ENV_VAR_NAME_LENGTH = 100;
const MAX_ENV_VAR_VALUE_LENGTH = 50_000;

const toPlatformEnvVar = (item: ActorEnvironmentVariable): PlatformEnvVar => ({
	name: item.name!,
	isSecret: Boolean(item.isSecret),
	...(item.isSecret ? {} : { value: item.value ?? '' }),
});

/** The env vars of the target version, in platform order. API errors propagate unchanged. */
export async function listPlatformEnvVars(target: EnvTarget): Promise<PlatformEnvVar[]> {
	const { items } = await versionClientFor(target).envVars().list();

	return items.map(toPlatformEnvVar);
}

/** One env var of the target version, or undefined when it doesn't exist. */
export async function getPlatformEnvVar(target: EnvTarget, name: string): Promise<PlatformEnvVar | undefined> {
	const item = await versionClientFor(target).envVar(name).get();

	return item ? toPlatformEnvVar(item) : undefined;
}

/**
 * The write functions return or throw the API error unchanged. Callers print only `err.message`: a network error
 * carries the request body, and so the value, in `config.data`.
 */
export async function createPlatformEnvVar(target: EnvTarget, { name, value, isSecret }: PlatformEnvVarWrite) {
	await versionClientFor(target).envVars().create({ name, value, isSecret });
}

/** A full replace, so it always sends the type. */
export async function updatePlatformEnvVar(target: EnvTarget, { name, value, isSecret }: PlatformEnvVarWrite) {
	await versionClientFor(target).envVar(name).update({ name, value, isSecret });
}

export async function deletePlatformEnvVar(target: EnvTarget, name: string) {
	await versionClientFor(target).envVar(name).delete();
}

/** Fails unless the name has 1-100 characters and no "=". A name with "=" isn't echoed: it may hold a value. */
export function validateEnvVarName(name: string): void {
	if (name.includes('=')) {
		envFail(
			'An env var name can\'t contain "=". Pass only the name: the command prompts for the value or reads it from standard input.',
		);
	}

	if (!name.length) {
		envFail("An env var name can't be empty.");
	}

	if (name.length > MAX_ENV_VAR_NAME_LENGTH) {
		envFail(`An env var name can have at most ${MAX_ENV_VAR_NAME_LENGTH} characters.`);
	}
}

/** Fails when the value is empty or too long. The message names the variable, never the value. */
export function validateEnvVarValue(name: string, value: string): void {
	if (!value.length) {
		envFail(`The value of ${name} is empty. Env vars on the Apify platform need a value.`);
	}

	if (value.length > MAX_ENV_VAR_VALUE_LENGTH) {
		envFail(`The value of ${name} is longer than ${MAX_ENV_VAR_VALUE_LENGTH} characters.`);
	}
}
