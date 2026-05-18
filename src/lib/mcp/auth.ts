import process from 'node:process';

import { CommandExitCodes } from '../consts.js';
import { error } from '../outputs.js';
import { getLocalUserInfo } from '../utils.js';

/**
 * Resolution order: --token flag → APIFY_TOKEN env → stored login.
 * Prints a user-facing error and sets process.exitCode when no token is available.
 */
export async function resolveApifyToken(tokenFlag: string | undefined): Promise<string | null> {
	if (tokenFlag) return tokenFlag;
	if (process.env.APIFY_TOKEN) return process.env.APIFY_TOKEN;

	const userInfo = await getLocalUserInfo();
	if (userInfo.token) return userInfo.token;

	error({
		message: `You are not logged in to Apify. Run 'apify login' first, or pass --token <api-token>.`,
	});
	process.exitCode = CommandExitCodes.MissingAuth;
	return null;
}
