import process from 'node:process';

import type { ApifyClient } from 'apify-client';

import { getLocalConfig } from '../utils.js';

/**
 * Tries to resolve what actor the command ran points to. If an actor id is provided via command line, attempt to resolve it,
 * thus assuming the actor is the one the command should be ran on. If no actor id is provided, try to resolve the actor from the local
 * configuration file. If none of these are successful, return null, signaling an unknown context, and thus no way to continue.
 * @param providedActorNameOrId Actor name or id provided via command line
 */
export async function resolveActorContext({
	providedActorNameOrId,
	client,
}: {
	providedActorNameOrId: string | undefined;
	client: ApifyClient;
}) {
	const userInfo = await client.user('me').get();
	const usernameOrId = userInfo.username || (userInfo.id as string);
	const localConfig = getLocalConfig(process.cwd()) || {};

	// Full ID
	if (providedActorNameOrId?.includes('/')) {
		const actor = await client.actor(providedActorNameOrId).get();
		if (!actor) {
			return {
				valid: false as const,
				reason: `Actor with ID "${providedActorNameOrId}" was not found`,
			};
		}

		return {
			valid: true as const,
			userFriendlyId: `${actor.username}/${actor.name}`,
			id: actor.id,
		};
	}

	// Try fetching Actor directly by name/id
	if (providedActorNameOrId) {
		const actorById = await client.actor(providedActorNameOrId).get();

		if (actorById) {
			return {
				valid: true as const,
				userFriendlyId: `${actorById.username}/${actorById.name}`,
				id: actorById.id,
			};
		}

		const actorByName = await client.actor(`${usernameOrId}/${providedActorNameOrId.toLowerCase()}`).get();

		if (actorByName) {
			return {
				valid: true as const,
				userFriendlyId: `${actorByName.username}/${actorByName.name}`,
				id: actorByName.id,
			};
		}

		return {
			valid: false as const,
			reason: `Actor with name or ID "${providedActorNameOrId}" was not found`,
		};
	}

	if (localConfig.name) {
		const actor = await client.actor(`${usernameOrId}/${localConfig.name}`).get();

		if (!actor) {
			return {
				valid: false as const,
				reason: `Actor with name "${localConfig.name}" was not found`,
			};
		}

		return {
			valid: true as const,
			userFriendlyId: `${actor.username}/${actor.name}`,
			id: actor.id,
		};
	}

	return {
		valid: false as const,
		reason: 'Unable to detect what Actor to create a build for',
	};
}
