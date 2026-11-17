import { findUnresolvedPathParams } from '../../../src/lib/commands/http-request.js';

describe('findUnresolvedPathParams', () => {
	it('should return an empty array for a path without placeholders', () => {
		expect(findUnresolvedPathParams('actor-runs')).toEqual([]);
		expect(findUnresolvedPathParams('/v2/actors/janedoe~my-actor/runs')).toEqual([]);
	});

	it('should find a single placeholder', () => {
		expect(findUnresolvedPathParams('actor-runs/{runId}')).toEqual(['runId']);
	});

	it('should find multiple placeholders in order', () => {
		expect(findUnresolvedPathParams('/v2/acts/{actorId}/runs/{runId}')).toEqual(['actorId', 'runId']);
	});

	it('should deduplicate repeated placeholder names', () => {
		expect(findUnresolvedPathParams('a/{id}/b/{id}')).toEqual(['id']);
	});

	it('should ignore braces that are not a whole segment', () => {
		expect(findUnresolvedPathParams('key-value-stores/abc/records/pre{fix}')).toEqual([]);
		expect(findUnresolvedPathParams('acts?filter={"a":1}')).toEqual([]);
	});

	it('should find placeholders in a path that carries a query string or fragment', () => {
		expect(findUnresolvedPathParams('actor-runs/{runId}?limit=1')).toEqual(['runId']);
		expect(findUnresolvedPathParams('acts/{actorId}/runs?status=SUCCEEDED')).toEqual(['actorId']);
		expect(findUnresolvedPathParams('actor-runs/{runId}#frag')).toEqual(['runId']);
	});

	it('should ignore percent-encoded braces', () => {
		expect(findUnresolvedPathParams('key-value-stores/abc/records/%7BrecordKey%7D')).toEqual([]);
	});
});
