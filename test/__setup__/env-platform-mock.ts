/**
 * An in-memory Apify platform for local `apify env` tests: Actors, versions, and their env vars.
 *
 * ```ts
 * vitest.mock('../../../../src/lib/utils.js', async (importOriginal) => {
 * 	const { envPlatform } = await import('../../../__setup__/env-platform-mock.js');
 * 	return {
 * 		...(await importOriginal<typeof import('../../../../src/lib/utils.js')>()),
 * 		getLoggedClientOrThrow: vitest.fn(async () => envPlatform.client),
 * 		getCurrentUserInfo: vitest.fn(async () => envPlatform.state.user),
 * 	};
 * });
 * const { envPlatform } = await import('../../../__setup__/env-platform-mock.js');
 * beforeEach(() => envPlatform.reset());
 * ```
 */

export interface FakeEnvVar {
	name: string;
	value?: string;
	isSecret?: boolean;
}

export interface FakeActor {
	id: string;
	username: string;
	name: string;
	versions: { versionNumber: string; envVars: FakeEnvVar[] }[];
}

type WriteMethod = 'create' | 'update' | 'delete';

export interface EnvPlatformWrite {
	method: WriteMethod;
	actorId: string;
	version: string;
	name: string;
}

const notFound = (what: string) => Object.assign(new Error(`${what} was not found`), { statusCode: 404 });

/** The API returns secrets without their value. */
const publicEnvVar = ({ name, value, isSecret }: FakeEnvVar) =>
	isSecret ? { name, isSecret: true } : { name, value, isSecret: false };

export function createEnvPlatformMock() {
	const state = {
		user: { id: 'user-id', username: 'tester' },
		actors: [] as FakeActor[],
	};
	const writes: EnvPlatformWrite[] = [];
	const pendingFailures: { method: WriteMethod; name: string; error: Error }[] = [];

	const findActor = (idOrName: string) => {
		const [username, name] = idOrName.replace('~', '/').split('/');
		return state.actors.find((actor) =>
			name === undefined ? actor.id === idOrName : actor.username === username && actor.name === name,
		);
	};

	const recordWrite = (method: WriteMethod, actor: FakeActor, version: string, name: string) => {
		const failureIndex = pendingFailures.findIndex((failure) => failure.method === method && failure.name === name);
		if (failureIndex !== -1) {
			const [{ error }] = pendingFailures.splice(failureIndex, 1);
			throw error;
		}

		writes.push({ method, actorId: actor.id, version, name });
	};

	const client = {
		actor: (idOrName: string) => {
			const actorOrThrow = () => {
				const actor = findActor(idOrName);
				if (!actor) throw notFound('Actor');
				return actor;
			};

			return {
				get: async () => {
					const actor = findActor(idOrName);
					if (!actor) return undefined;

					return {
						id: actor.id,
						username: actor.username,
						name: actor.name,
						versions: actor.versions.map(({ versionNumber }) => ({ versionNumber })),
					};
				},
				version: (versionNumber: string) => {
					const versionOrThrow = () => {
						const actor = actorOrThrow();
						const version = actor.versions.find((v) => v.versionNumber === versionNumber);
						if (!version) throw notFound('Actor version');
						return { actor, version };
					};

					return {
						envVars: () => ({
							list: async () => {
								const { version } = versionOrThrow();
								return { total: version.envVars.length, items: version.envVars.map(publicEnvVar) };
							},
							create: async (envVar: FakeEnvVar) => {
								const { actor, version } = versionOrThrow();
								recordWrite('create', actor, versionNumber, envVar.name);
								version.envVars.push({ ...envVar, isSecret: Boolean(envVar.isSecret) });
								return publicEnvVar(envVar);
							},
						}),
						envVar: (name: string) => ({
							get: async () => {
								const { version } = versionOrThrow();
								const envVar = version.envVars.find((v) => v.name === name);
								return envVar ? publicEnvVar(envVar) : undefined;
							},
							update: async (envVar: FakeEnvVar) => {
								const { actor, version } = versionOrThrow();
								const index = version.envVars.findIndex((v) => v.name === name);
								if (index === -1) throw notFound('Environment variable');
								recordWrite('update', actor, versionNumber, name);
								version.envVars[index] = { ...envVar, isSecret: Boolean(envVar.isSecret) };
								return publicEnvVar(envVar);
							},
							delete: async () => {
								const { actor, version } = versionOrThrow();
								const index = version.envVars.findIndex((v) => v.name === name);
								if (index === -1) throw notFound('Environment variable');
								recordWrite('delete', actor, versionNumber, name);
								version.envVars.splice(index, 1);
							},
						}),
					};
				},
			};
		},
	};

	return {
		state,
		/** Every successful write, in call order. */
		writes,
		/** Makes the next write of `name` with `method` throw `error`. */
		failNext(method: WriteMethod, name: string, error: Error) {
			pendingFailures.push({ method, name, error });
		},
		/** ApifyClient-shaped; cast it where a real client is expected. */
		client: client as unknown,
		reset() {
			state.user = { id: 'user-id', username: 'tester' };
			state.actors = [];
			writes.length = 0;
			pendingFailures.length = 0;
		},
	};
}

export const envPlatform = createEnvPlatformMock();
