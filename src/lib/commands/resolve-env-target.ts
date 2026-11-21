import { resolve } from 'node:path';
import process from 'node:process';

import type { ApifyClient } from 'apify-client';

import { Flags } from '../command-framework/flags.js';
import { CommandExitCodes, LOCAL_CONFIG_PATH } from '../consts.js';
import { getLocalConfig } from '../utils.js';
import { resolveActorContext } from './resolve-actor-context.js';

const DEFAULT_ACTOR_VERSION_NUMBER = '0.0';

/** The flags every `apify env` command uses to pick the Actor and its version. */
export const envTargetFlags = {
	dir: Flags.string({
		description: `Directory of the Actor whose '${LOCAL_CONFIG_PATH}' picks the Actor. Defaults to the current directory.`,
		required: false,
		exclusive: ['actor'],
	}),
	actor: Flags.string({
		description: `Actor ID or "username/name". Use it to target an Actor without a local project.`,
		required: false,
		exclusive: ['dir'],
	}),
	version: Flags.string({
		char: 'v',
		description: `Actor version number. Defaults to the version in '${LOCAL_CONFIG_PATH}', or 0.0 with --actor.`,
		required: false,
	}),
};

export type EnvTarget =
	| { ok: true; actorId: string; actorName: string; versionNumber: string }
	| { ok: false; message: string; exitCode: CommandExitCodes };

/**
 * Picks the Actor and the version an `apify env` command works on. The Actor comes from `--actor`, else from the
 * Actor config in `--dir` (default: the current directory). The version comes from `--version`, then from the Actor
 * config, then 0.0, the same order `apify push` uses. With `--actor`, the local config isn't used, because it belongs
 * to another Actor.
 */
export async function resolveEnvTarget({
	client,
	flags,
}: {
	client: ApifyClient;
	flags: { dir?: string; actor?: string; version?: string };
}): Promise<EnvTarget> {
	const cwd = resolve(process.cwd(), flags.dir ?? '.');

	const ctx = await resolveActorContext({ providedActorNameOrId: flags.actor, client, cwd });

	if (!ctx.valid) {
		return { ok: false, message: `${ctx.reason}.`, exitCode: CommandExitCodes.NotFound };
	}

	const localVersion = flags.actor ? undefined : (getLocalConfig(cwd)?.version as string | undefined);
	const versionNumber = flags.version || localVersion || DEFAULT_ACTOR_VERSION_NUMBER;

	const actor = await client.actor(ctx.id).get();
	const versionNumbers = (actor?.versions ?? []).map((version) => version.versionNumber);

	if (!versionNumbers.includes(versionNumber)) {
		const existing = versionNumbers.length ? `Its versions: ${versionNumbers.join(', ')}.` : 'It has no versions.';

		return {
			ok: false,
			message: `Version ${versionNumber} doesn't exist for Actor ${ctx.userFriendlyId}. ${existing}`,
			exitCode: CommandExitCodes.NotFound,
		};
	}

	return { ok: true, actorId: ctx.id, actorName: ctx.userFriendlyId, versionNumber };
}
