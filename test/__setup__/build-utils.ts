import type { ApifyClient } from 'apify-client';

/**
 * Waits for the build to finish
 */
export const waitForBuildToFinish = (client: ApifyClient, buildId: string) => {
	return client.build(buildId).waitForFinish();
};

/**
 * Waits for build to finish with timeout, throws an error on timeout
 */
export const waitForBuildToFinishWithTimeout = async (client: ApifyClient, buildId: string, timeoutSecs = 60) => {
	const buildPromise = waitForBuildToFinish(client, buildId);
	const timeoutPromise = new Promise((resolve) => {
		setTimeout(() => resolve(false), timeoutSecs * 1000);
	});
	const result = await Promise.race([buildPromise, timeoutPromise]);
	if (!result) throw new Error(`Timed out after ${timeoutSecs} seconds`);
};

/**
 * Waits until the platform reports a `latest` build for the Actor, then waits for that build to finish.
 * The builds list and tagged builds are updated asynchronously after `apify push` returns.
 */
export const waitForLatestBuildToFinish = async (client: ApifyClient, actorId: string, timeoutSecs = 60) => {
	const deadline = Date.now() + timeoutSecs * 1000;

	while (Date.now() < deadline) {
		const actor = await client.actor(actorId).get();
		const buildId = actor?.taggedBuilds?.latest?.buildId;

		if (buildId) {
			await waitForBuildToFinishWithTimeout(client, buildId, Math.ceil((deadline - Date.now()) / 1000));
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	throw new Error(`No latest build appeared for Actor ${actorId} within ${timeoutSecs} seconds`);
};
