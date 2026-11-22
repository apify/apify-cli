import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import jju from 'jju';

import { CommandExitCodes, LOCAL_CONFIG_PATH, SECRETS_FILE_PATH } from '../consts.js';
import { envFail } from './errors.js';
import { SECRET_REF_PATTERN } from './legacy.js';

export interface ActorJsonDocument {
	path: string;
	text: string;
	config: Record<string, unknown>;
}

/** Reads and parses `.actor/actor.json` in the Actor directory, comments included. */
export function readActorJsonDocument(actorDir: string): ActorJsonDocument {
	const path = join(actorDir, LOCAL_CONFIG_PATH);

	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch (err) {
		const { code, message } = err as NodeJS.ErrnoException;
		if (code === 'ENOENT') {
			envFail(`No ${LOCAL_CONFIG_PATH} in ${actorDir}. Run the command in an Actor directory, or pass --dir <path>.`);
		}
		envFail(`Couldn't read ${path}: ${message}`, CommandExitCodes.InvalidActorJson);
	}

	let config: unknown;
	try {
		config = jju.parse(text);
	} catch (err) {
		// jju's message ends with a code frame of the line, which may hold a value: keep only the position.
		const reason = (err as Error).message.split('\n')[0];
		envFail(`${path} isn't valid JSON: ${reason}`, CommandExitCodes.InvalidActorJson);
	}

	if (!config || typeof config !== 'object' || Array.isArray(config)) {
		envFail(`${path} doesn't hold a JSON object.`, CommandExitCodes.InvalidActorJson);
	}

	return { path, text, config: config as Record<string, unknown> };
}

/** Reads ~/.apify/secrets.json on its own, so `apify env migrate` keeps working once `apify secrets` is removed. */
export function readLegacySecrets(): Record<string, string> {
	const path = SECRETS_FILE_PATH();

	let content: string;
	try {
		content = readFileSync(path, 'utf8');
	} catch (err) {
		const { code, message } = err as NodeJS.ErrnoException;
		if (code === 'ENOENT') return {};
		envFail(`Couldn't read ${path}: ${message}`);
	}

	let secrets: unknown;
	try {
		secrets = JSON.parse(content);
	} catch {
		// JSON.parse quotes the content in its message, so it isn't passed on.
		secrets = undefined;
	}

	if (!secrets || typeof secrets !== 'object' || Array.isArray(secrets)) {
		envFail(`${path} isn't a valid JSON object. Fix it, then run the command again.`);
	}

	return Object.fromEntries(
		Object.entries(secrets).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
	);
}

/**
 * The values of `environmentVariables` with `@secret` references resolved. Other values are converted with String().
 * A reference to a secret that isn't stored (or is empty, as `apify run` treats it) is listed in `missingSecrets` and
 * its key gets an empty value.
 */
export function resolveLegacyEnvVars(
	env: Record<string, unknown>,
	secrets: Record<string, string>,
): { values: Record<string, string>; missingSecrets: { key: string; secretName: string }[] } {
	const values: Record<string, string> = {};
	const missingSecrets: { key: string; secretName: string }[] = [];

	for (const [key, value] of Object.entries(env)) {
		if (typeof value === 'string' && SECRET_REF_PATTERN.test(value)) {
			const secretName = value.slice(1);
			const secret = Object.hasOwn(secrets, secretName) ? secrets[secretName] : '';
			if (!secret) missingSecrets.push({ key, secretName });
			values[key] = secret;
		} else {
			values[key] = String(value);
		}
	}

	return { values, missingSecrets };
}

/** Removes `environmentVariables` from `.actor/actor.json` with jju, which keeps the comments and formatting. */
export function removeEnvironmentVariablesFromActorJson(actorDir: string): void {
	const { path, text, config } = readActorJsonDocument(actorDir);
	if (!Object.hasOwn(config, 'environmentVariables')) return;

	delete config.environmentVariables;
	try {
		writeFileSync(path, jju.update(text, config));
	} catch (err) {
		envFail(`Couldn't write ${path}: ${(err as Error).message}`, CommandExitCodes.InvalidActorJson);
	}
}
