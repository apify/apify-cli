import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';

import { AGENT_STATE_FILE_PATH } from '../consts.js';

export interface ClientStateRecord {
	client: string;
	tier: string;
	installedAt: string; // ISO 8601
}

export interface AgentState {
	installedAt: string; // timestamp of first apify agent setup run
	clients: ClientStateRecord[];
}

export async function readAgentState(): Promise<AgentState | null> {
	try {
		const text = await readFile(AGENT_STATE_FILE_PATH(), 'utf-8');
		return JSON.parse(text) as AgentState;
	} catch {
		return null;
	}
}

export function isClientConfigured(state: AgentState, client: string): boolean {
	return state.clients.some((r) => r.client === client);
}

export async function writeAgentState(state: AgentState): Promise<void> {
	const filePath = AGENT_STATE_FILE_PATH();
	await mkdir(dirname(filePath), { recursive: true });
	const tmpPath = `${filePath}.${process.pid}.tmp`;
	try {
		await writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
		await rename(tmpPath, filePath);
	} catch (err) {
		await rm(tmpPath, { force: true });
		throw err;
	}
}
