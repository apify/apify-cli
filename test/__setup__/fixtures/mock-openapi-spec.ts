export const MOCK_OPENAPI_SPEC = {
	paths: {
		'/v2/acts': {
			get: { summary: 'Get list of Actors' },
			post: { summary: 'Create Actor' },
		},
		'/v2/acts/{actorId}': {
			get: { summary: 'Get Actor' },
			put: { summary: 'Update Actor' },
			delete: { summary: 'Delete Actor' },
		},
		'/v2/acts/{actorId}/runs': {
			get: { summary: 'Get list of Actor runs' },
			post: { summary: 'Run Actor' },
		},
		'/v2/acts/{actorId}/runs/{runId}': {
			get: { summary: 'Get Actor run' },
		},
		'/v2/actor-runs/{runId}': {
			get: { summary: 'Get run' },
			delete: { summary: 'Delete run' },
		},
		'/v2/actor-runs/{runId}/abort': {
			post: { summary: 'Abort run' },
		},
		'/v2/datasets': {
			get: { summary: 'Get list of datasets' },
			post: { summary: 'Create dataset' },
		},
		'/v2/datasets/{datasetId}': {
			get: { summary: 'Get dataset' },
			delete: { summary: 'Delete dataset' },
		},
		'/v2/users/me': {
			get: { summary: 'Get private user data' },
		},
	},
};

export function mockFetchSpec() {
	return vitest.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(JSON.stringify(MOCK_OPENAPI_SPEC), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		}),
	);
}
