import { loadJsonFileSync } from 'load-json-file';
import { writeJsonFileSync } from 'write-json-file';

import { STATE_FILE_PATH } from './consts.js';

/**
 * Returns state object from auth file or empty object.
 * This method is synchronous/blocking to avoid different race conditions.
 */
export const getLocalState = () => {
	try {
		return loadJsonFileSync<Record<string, unknown>>(STATE_FILE_PATH()) || {};
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
	writeJsonFileSync(STATE_FILE_PATH(), {
		...state,
		...data,
	});
};
