import type { ApifyClient } from 'apify-client';

/**
 * Waits for the build to finish
 */
export const waitForBuildToFinish = async (client: ApifyClient, buildId: string) => {
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
