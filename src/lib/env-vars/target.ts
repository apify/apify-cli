import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import type { Actor, ActorVersionClient, ApifyClient } from 'apify-client';

import { CommandExitCodes, LOCAL_CONFIG_PATH } from '../consts.js';
import { findActorDirs, toPosixRelative } from '../find-actor-dirs.js';
import { useActorConfig } from '../hooks/useActorConfig.js';
import { getCurrentUserInfo, getLoggedClientOrThrow } from '../utils.js';
import { envFail } from './errors.js';

const DEFAULT_VERSION_NUMBER = '0.0';

export interface EnvTargetFlags {
	dir?: string;
	actor?: string;
	version?: string;
}

export interface EnvTarget {
	client: ApifyClient;
	/** Absolute path of `--dir` (or the current directory). The .env file lives here. */
	actorDir: string;
	actor: { id: string; username: string; name: string };
	/** `username/name`, for messages and --json. */
	actorLabel: string;
	versionNumber: string;
	versionSource: 'flag' | 'actor.json' | 'default';
	/** `.actor/actor.json` (or a legacy apify.json) when the Actor came from it; undefined with --actor. */
	actorConfig?: Record<string, unknown>;
}

export function assertDirectory(actorDir: string): void {
	let isDirectory = false;
	try {
		isDirectory = statSync(actorDir).isDirectory();
	} catch {
		// Reported below.
	}

	if (!isDirectory) envFail(`Directory ${actorDir} doesn't exist.`);
}

async function readLocalActorConfig(actorDir: string): Promise<Record<string, unknown> & { name: string }> {
	const result = await useActorConfig({ cwd: actorDir, migrateConfig: false, warnAboutOldConfig: false });

	if (result.isErr()) {
		const { message, cause } = result.unwrapErr();
		envFail(cause ? `${message} ${cause.message}` : message, CommandExitCodes.InvalidActorJson);
	}

	const { exists, config } = result.unwrap();

	if (!exists) {
		const actorDirs = await findActorDirs(actorDir);
		if (actorDirs.length) {
			const dirs = actorDirs.map(({ dir }) => toPosixRelative(process.cwd(), resolve(actorDir, dir))).join(', ');
			envFail(`This directory has no Actor of its own. Pass --dir with one of: ${dirs}`);
		}

		envFail(
			`No Actor found in ${actorDir}. Run the command in an Actor directory, pass --dir <path>, or pass --actor <ID or username/name>.`,
		);
	}

	if (typeof config.name !== 'string' || !config.name) {
		envFail(`${LOCAL_CONFIG_PATH} has no "name". Add it, or pass --actor <ID or username/name>.`);
	}

	return config as Record<string, unknown> & { name: string };
}

async function findActorByFlag(client: ApifyClient, actorFlag: string, me: () => Promise<string>) {
	const actor =
		(await client.actor(actorFlag).get()) ??
		(actorFlag.includes('/') ? undefined : await client.actor(`${await me()}/${actorFlag.toLowerCase()}`).get());

	if (!actor) {
		envFail(`Actor "${actorFlag}" doesn't exist, or your account can't access it.`, CommandExitCodes.NotFound);
	}

	return actor;
}

/**
 * Resolves the Actor and version an `apify env` command works on, from `--dir`, `--actor`, `--version`, and the local
 * `.actor/actor.json`. Local checks run before the login, as in `apify push`. Never prints anything.
 */
export async function resolveEnvTarget(flags: EnvTargetFlags): Promise<EnvTarget> {
	const actorDir = resolve(process.cwd(), flags.dir ?? '.');
	assertDirectory(actorDir);

	// With --actor, a local actor.json is ignored: its version may belong to another Actor.
	const actorConfig = flags.actor ? undefined : await readLocalActorConfig(actorDir);

	const client = await getLoggedClientOrThrow();
	const me = async () => {
		const userInfo = await getCurrentUserInfo();
		return userInfo.username || (userInfo.id as string);
	};

	let actor: Actor;
	let versionNumber: string;
	let versionSource: EnvTarget['versionSource'];

	if (actorConfig) {
		const username = await me();
		const found = await client.actor(`${username}/${actorConfig.name}`).get();
		if (!found) {
			envFail(
				`Actor ${username}/${actorConfig.name} doesn't exist on the Apify platform. Run apify push to create it, or pass --actor <ID or username/name>.`,
				CommandExitCodes.NotFound,
			);
		}

		actor = found;
		// A legacy apify.json can hold an object in "version", so only a string counts.
		const configVersion = typeof actorConfig.version === 'string' && actorConfig.version ? actorConfig.version : '';
		versionNumber = flags.version || configVersion || DEFAULT_VERSION_NUMBER;
		versionSource = flags.version ? 'flag' : configVersion ? 'actor.json' : 'default';
	} else {
		actor = await findActorByFlag(client, flags.actor!, me);
		versionNumber = flags.version || DEFAULT_VERSION_NUMBER;
		versionSource = flags.version ? 'flag' : 'default';
	}

	const actorLabel = `${actor.username}/${actor.name}`;
	const versions = (actor.versions ?? []).map((version) => version.versionNumber);

	if (!versions.includes(versionNumber)) {
		const sourceHint = versionSource === 'actor.json' ? ` (taken from ${LOCAL_CONFIG_PATH})` : '';
		const known = versions.length ? `Its versions: ${versions.join(', ')}.` : 'The Actor has no versions.';
		envFail(
			`Version ${versionNumber} doesn't exist on Actor ${actorLabel}${sourceHint}. ${known} Pass --version <number>.`,
			CommandExitCodes.NotFound,
		);
	}

	return {
		client,
		actorDir,
		actor: { id: actor.id, username: actor.username, name: actor.name },
		actorLabel,
		versionNumber,
		versionSource,
		actorConfig,
	};
}

/** The version client for the target. */
export function versionClientFor(target: EnvTarget): ActorVersionClient {
	return target.client.actor(target.actor.id).version(target.versionNumber);
}
