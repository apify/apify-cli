import { readFileSync, writeFileSync } from 'node:fs';

import { STATE_FILE_PATH } from './consts.js';
import { ensureApifyDirectory } from './utils.js';

/**
 * Returns state object from auth file or empty object.
 * This method is synchronous/blocking to avoid different race conditions.
 */
export const getLocalState = () => {
	try {
		return JSON.parse(readFileSync(STATE_FILE_PATH(), 'utf-8')) || {};
	} catch (e) {
		return {};
	}
};

/**
 * Extends local state by given values.
 * This method is synchronous/blocking to avoid different race conditions.
 */
export const extendLocalState = (data: Record<string, unknown>) => {
	const state = getLocalState();
	ensureApifyDirectory(STATE_FILE_PATH());
	writeFileSync(STATE_FILE_PATH(), JSON.stringify({ ...state, ...data }, null, '\t'));
};
