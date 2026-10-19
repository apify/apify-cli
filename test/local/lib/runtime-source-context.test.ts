import { join, resolve } from 'node:path';

import { resolveDockerContext } from '../../../src/lib/runtime/source-context.js';

// `resolve`, not `join`: on Windows the resolved context carries the drive (`D:\repo`), as the command resolves it.
const repoDir = resolve('/repo');
const actorDir = join(repoDir, 'actors', 'a');

describe('resolveDockerContext', () => {
	it('resolves dockerContextDir relative to the .actor folder', () => {
		// Outside a Git repository, the context itself is what is pushed.
		expect(resolveDockerContext(actorDir, '../../..')).toEqual({
			kind: 'context',
			contextRoot: repoDir,
			sourceRoot: repoDir,
			actorPath: 'actors/a',
		});
	});

	it('treats a missing field, or a context that is the Actor folder itself, as an ordinary push', () => {
		expect(resolveDockerContext(actorDir, undefined)).toEqual({ kind: 'none' });
		expect(resolveDockerContext(actorDir, '')).toEqual({ kind: 'none' });
		expect(resolveDockerContext(actorDir, '..')).toEqual({ kind: 'none' });
	});

	it('rejects a context that does not contain the Actor, and a non-string field', () => {
		expect(resolveDockerContext(actorDir, './sub')).toMatchObject({ kind: 'invalid' });
		expect(resolveDockerContext(actorDir, '../../../../other')).toMatchObject({ kind: 'invalid' });
		expect(resolveDockerContext(actorDir, 42)).toMatchObject({ kind: 'invalid' });
	});
});
