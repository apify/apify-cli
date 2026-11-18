import { describe, expect, it } from 'vitest';

import { buildNextSteps, formatCreateSuccessMessage } from '../../../src/lib/create-utils.js';

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

	// The success banner is the only place a human sees the next steps, so the hint has to reach it.
	it('carries the server hint into the success message', () => {
		expect(formatCreateSuccessMessage({ ...base, usesStandbyMode: true })).toContain('apify run --server');
		expect(formatCreateSuccessMessage(base)).not.toContain('apify run --server');
	});

	it('keeps pointing a template without a Git remote at apify push', () => {
		const message = formatCreateSuccessMessage({ ...base, gitRepositoryInitialized: true });

		expect(message).toContain("Use 'apify push'");
		expect(message).not.toContain('builds from this repository');
	});
});

describe('buildNextSteps', () => {
	const base = { actorName: 'my-scraper', dependenciesInstalled: true };

	it('points a Server Actor at apify run --server', () => {
		expect(buildNextSteps({ ...base, usesStandbyMode: true })).toEqual(['cd "my-scraper"', 'apify run --server']);
	});

	it('points an ordinary Actor at apify run', () => {
		expect(buildNextSteps(base)).toEqual(['cd "my-scraper"', 'apify run']);
		expect(buildNextSteps({ ...base, usesStandbyMode: false })).toEqual(['cd "my-scraper"', 'apify run']);
	});

	it('treats a non-boolean usesStandbyMode by its truthiness', () => {
		const truthy = buildNextSteps({ ...base, usesStandbyMode: 'true' as unknown as boolean });
		const falsy = buildNextSteps({ ...base, usesStandbyMode: '' as unknown as boolean });

		expect(truthy).toContain('apify run --server');
		expect(falsy).toContain('apify run');
		expect(falsy).not.toContain('apify run --server');
	});

	it('keeps the install step ahead of the run step', () => {
		const steps = buildNextSteps({
			actorName: 'my-scraper',
			dependenciesInstalled: false,
			installCommandSuggestion: 'npm install',
			usesStandbyMode: true,
		});

		expect(steps).toEqual(['cd "my-scraper"', 'npm install', 'apify run --server']);
	});
});
