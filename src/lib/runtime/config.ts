import { readFileSync, writeFileSync } from 'node:fs';

import { ACTOR_RUNTIME_CONFIG_FILE_PATH } from '../consts.js';
import { ensureApifyDirectory } from '../files.js';

/** What the CLI remembers about the Actor runtime between commands, stored in `~/.apify/actor-runtime/config.json`. */
export interface ActorRuntimeConfig {
	/** The image the last `apify runtime install` fetched. */
	image?: string;
	/** Whether `apify runtime connect` pointed the CLI at the runtime. */
	connected?: boolean;
}

export function readActorRuntimeConfig(): ActorRuntimeConfig {
	try {
		const parsed = JSON.parse(readFileSync(ACTOR_RUNTIME_CONFIG_FILE_PATH(), 'utf-8')) as unknown;
		return parsed && typeof parsed === 'object' ? (parsed as ActorRuntimeConfig) : {};
	} catch {
		return {};
	}
}

/** Merges `patch` into the stored config, so writing one field never drops the others. */
export function updateActorRuntimeConfig(patch: ActorRuntimeConfig) {
	ensureApifyDirectory(ACTOR_RUNTIME_CONFIG_FILE_PATH());
	writeFileSync(
		ACTOR_RUNTIME_CONFIG_FILE_PATH(),
		JSON.stringify({ ...readActorRuntimeConfig(), ...patch }, null, '\t'),
	);
}
