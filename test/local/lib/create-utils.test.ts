import { describe, expect, it } from 'vitest';

import { formatCreateSuccessMessage } from '../../../src/lib/create-utils.js';

describe('formatCreateSuccessMessage', () => {
	const base = { actorName: 'my-scraper', dependenciesInstalled: true };
	const gitRemote = { remoteUrl: 'git@github.com:apify/my-scraper.git', actorId: 'abc123' };

	// `apify push` replaces the source with the local files, which is the opposite of what a Git-sourced
	// Actor wants, so the Git cases must never suggest it.
	it('names the repository the Actor builds from', () => {
		const message = formatCreateSuccessMessage({ ...base, gitRemote: { ...gitRemote, automaticBuilds: 'on' } });

		expect(message).toContain('git@github.com:apify/my-scraper.git');
		expect(message).toContain('Actor abc123 builds from this repository');
		expect(message).not.toContain('apify push');
	});

	// Registering the webhook needs admin rights on the repository, which connecting the account does not,
	// so the promise that a push rebuilds anything has to follow what actually landed.
	it('promises a rebuild on push only once the webhook is registered', () => {
		const on = formatCreateSuccessMessage({ ...base, gitRemote: { ...gitRemote, automaticBuilds: 'on' } });
		const failed = formatCreateSuccessMessage({ ...base, gitRemote: { ...gitRemote, automaticBuilds: 'failed' } });

		expect(on).toContain('Every push to this repository rebuilds the Actor');
		expect(on).not.toContain('Turn on Automatic builds');

		expect(failed).toContain('Turn on Automatic builds');
		expect(failed).not.toContain('Every push to this repository rebuilds');
	});

	// Someone who passed --auto-build=off does not need to be told how to turn it on.
	it('says nothing about automatic builds when they were not asked for', () => {
		const message = formatCreateSuccessMessage({ ...base, gitRemote: { ...gitRemote, automaticBuilds: 'off' } });

		expect(message).toContain('builds from this repository');
		expect(message).not.toContain('Automatic builds');
		expect(message).not.toContain('Every push');
	});

	it('keeps pointing a template without a Git remote at apify push', () => {
		const message = formatCreateSuccessMessage({ ...base, gitRepositoryInitialized: true });

		expect(message).toContain("Use 'apify push'");
		expect(message).not.toContain('builds from this repository');
	});
});
