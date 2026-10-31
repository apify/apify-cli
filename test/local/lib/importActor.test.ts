import { describe, expect, it } from 'vitest';

import { parseGitRemote } from '../../../src/lib/git-source/importActor.js';

describe('parseGitRemote', () => {
	it.each([
		['git@github.com:apify/repo.git', 'git@github.com:apify/repo.git'],
		['ssh://git@github.com/apify/repo.git', 'git@github.com:apify/repo.git'],
		['https://github.com/apify/repo/', 'git@github.com:apify/repo.git'],
		['git@gitlab.com:group/subgroup/repo.git', 'git@gitlab.com:group/subgroup/repo.git'],
		['git@example.com:apify/repo.git', undefined],
		['https://github.com/repo', undefined],
	])('%s → %s', (remote, sshUrl) => {
		expect(parseGitRemote(remote)?.sshUrl).toBe(sshUrl);
	});
});
