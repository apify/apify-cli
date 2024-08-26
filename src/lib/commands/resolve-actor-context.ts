import process from 'node:process';

import type { ApifyClient } from 'apify-client';

import { getLocalConfig, getLocalUserInfo } from '../utils.js';

/**
 * Tries to resolve what actor the command ran points to. If an actor id is provided via command line, attempt to resolve it,
 * thus assuming the actor is the one the command should be ran on. If no actor id is provided, try to resolve the actor from the local
 * configuration file. If none of these are successful, return null, signaling an unknown context, and thus no way to continue.
 * @param providedActorNameOrId Actor name or id provided via command line
 */
export async function resolveActorContext({
	providedActorNameOrId,
	client,
}: { providedActorNameOrId: string | undefined; client: ApifyClient }) {
	const userInfo = await getLocalUserInfo();
	const usernameOrId = userInfo.username || (userInfo.id as string);
	const localConfig = getLocalConfig(process.cwd()) || {};

	// Full ID
	if (providedActorNameOrId?.includes('/')) {
		const actor = await client.actor(providedActorNameOrId).get();
		if (!actor) {
			return null;
		}

		return {
			userFriendlyId: `${actor.username}/${actor.name}`,
			id: actor.id,
		};
	}

	// Try fetching Actor directly by name/id
	if (providedActorNameOrId) {
		const actorById = await client.actor(providedActorNameOrId).get();

		if (actorById) {
			return {
				userFriendlyId: `${actorById.username}/${actorById.name}`,
				id: actorById.id,
			};
		}

		const actorByName = await client.actor(`${usernameOrId}/${providedActorNameOrId.toLowerCase()}`).get();

		if (actorByName) {
			return {
				userFriendlyId: `${actorByName.username}/${actorByName.name}`,
				id: actorByName.id,
			};
		}

		return null;
	}

	if (localConfig.name) {
		const actor = await client.actor(`${usernameOrId}/${localConfig.name}`).get();

		if (!actor) {
			return null;
		}

		return {
			userFriendlyId: `${actor.username}/${actor.name}`,
			id: actor.id,
		};
	}

	return null;
}
