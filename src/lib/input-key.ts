import escapeStringRegexp from 'escape-string-regexp';

import { ACTOR_ENV_VARS, APIFY_ENV_VARS } from '@apify/consts';

// Not available in @apify/consts
export const CRAWLEE_INPUT_KEY_ENV = 'CRAWLEE_INPUT_KEY';

/** Prefix used when creating temporary input files so the user's original is never touched. */
export const TEMP_INPUT_KEY_PREFIX = '__CLI_';

/**
 * Resolves the input key from environment variables in priority order:
 * ACTOR_INPUT_KEY > APIFY_INPUT_KEY > CRAWLEE_INPUT_KEY > "INPUT"
 */
export function resolveInputKey(): string {
	return (
		process.env[ACTOR_ENV_VARS.INPUT_KEY] ||
		process.env[APIFY_ENV_VARS.INPUT_KEY] ||
		process.env[CRAWLEE_INPUT_KEY_ENV] ||
		'INPUT'
	);
}

/**
 * Creates a RegExp that matches the given key with an optional file extension.
 * e.g. inputFileRegExp('INPUT') matches 'INPUT', 'INPUT.json', 'INPUT.bin'
 */
export function inputFileRegExp(key: string): RegExp {
	return new RegExp(`(^${escapeStringRegexp(key)}(?:\\.[^.]+)?$)`);
}
