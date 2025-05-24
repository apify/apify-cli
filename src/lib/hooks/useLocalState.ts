import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { STATE_FILE_PATH } from '../consts.js';
import { cliDebugPrint } from '../utils/cliDebugPrint.js';

type LocalState = LocalStateV0 | LocalStateV1;

export type LatestState = LocalStateV1;

export interface LocalStateV0 {
	version?: never;
	latestNpmVersionCheckedAt?: string;
	latestNpmVersion?: string;
}

export interface LocalStateV1 {
	version: 1;
	versionCheck?: {
		lastChecked: number;
		lastVersion?: string;
	};
}

function migrateStateV0ToV1(state: LocalState) {
	// No migration needed
	if (state.version && state.version >= 1) {
		return false;
	}

	const casted = state as LocalStateV0;

	if (casted.latestNpmVersionCheckedAt) {
		const lastChecked = new Date(casted.latestNpmVersionCheckedAt).getTime();
		const lastVersion = casted.latestNpmVersion;

		cliDebugPrint('LocalStateV0ToV1', 'Migrating state from v0 to v1', {
			oldState: state,
			newState: {
				versionCheck: {
					lastChecked,
					lastVersion,
				},
			},
		});

		updateLocalState({ version: 1 }, (stateToUpdate) => {
			stateToUpdate.versionCheck = {
				lastChecked,
				lastVersion,
			};
		});
	}

	return true;
}

const emptyState: LatestState = {
	version: 1,
};

export function useLocalState(): LatestState {
	const stateFilePath = STATE_FILE_PATH();

	const exists = existsSync(stateFilePath);

	if (!exists) {
		return emptyState;
	}

	const state = JSON.parse(readFileSync(stateFilePath, 'utf-8')) as LocalState;

	if (migrateStateV0ToV1(state)) {
		return useLocalState();
	}

	return state as LatestState;
}

export type StateUpdater = (state: LatestState) => void;

export function updateLocalState(state: LatestState, updater: StateUpdater) {
	// Update the state in memory
	const stateClone = { ...state };
	updater(stateClone);

	const filePath = STATE_FILE_PATH();
	const dirPath = dirname(filePath);

	mkdirSync(dirPath, { recursive: true });

	writeFileSync(STATE_FILE_PATH(), JSON.stringify(stateClone, null, '\t'));
}
