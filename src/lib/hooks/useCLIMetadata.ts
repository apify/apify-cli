import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';

import { warning } from '../outputs.js';

export const DEVELOPMENT_VERSION_MARKER = '0.0.0';
export const DEVELOPMENT_HASH_MARKER = '0000000';

// These values are replaced with the actual values when building the CLI
const CLI_VERSION = '0.20.0';
const CLI_HASH = DEVELOPMENT_HASH_MARKER;

export type InstallMethod = 'npm' | 'pnpm' | 'homebrew' | 'volta' | 'bundle';

export interface CLIMetadata {
	version: string;
	hash: string;
	runtime: string;
	platform: Exclude<(typeof process)['platform'], 'win32'> | 'windows';
	arch: (typeof process)['arch'];
	extraRuntimeData: string;
	installMethod: InstallMethod;
	fullVersionString: string;
	/**
	 * When set, represents the APIFY_CLI_HOME environment variable / $HOME/.apify/bin folder (when installed via bundles).
	 */
	installPath?: string;
}

function detectInstallMethod(): InstallMethod {
	// Will be useful once npm versions move to running from bundles (and for testing)
	if (process.env.APIFY_CLI_MARKED_INSTALL_METHOD) {
		return process.env.APIFY_CLI_MARKED_INSTALL_METHOD as InstallMethod;
	}

	// This if check is special, and gets replaced with an always-true branch when running from bun bundles
	if (process.env.APIFY_CLI_BUNDLE) {
		return 'bundle';
	}

	const entrypointFilePathRaw = process.argv[1];

	// Should be impossible, but if it is
	if (!entrypointFilePathRaw) {
		warning({ message: `Failed to detect install method of CLI, assuming npm` });
		return 'npm';
	}

	const entrypointFilePath = realpathSync(entrypointFilePathRaw);

	if (process.env.VOLTA_HOME && entrypointFilePath.includes(process.env.VOLTA_HOME)) {
		return 'volta';
	}

	if (entrypointFilePath.includes('homebrew/Cellar') || entrypointFilePath.includes('linuxbrew/Cellar')) {
		return 'homebrew';
	}

	if (process.env.PNPM_HOME && entrypointFilePath.includes(process.env.PNPM_HOME)) {
		return 'pnpm';
	}

	return 'npm';
}

function getRuntimeInfo() {
	if (process.versions.bun) {
		return {
			runtime: 'bun',
			version: process.versions.bun,
			nodeVersion: process.versions.node,
		};
	}

	if (process.versions.deno) {
		return {
			runtime: 'deno',
			version: process.versions.deno,
			nodeVersion: process.versions.node,
		};
	}

	return {
		runtime: 'node',
		version: process.versions.node,
	};
}

let cachedMetadata: CLIMetadata | null = null;

export function useCLIMetadata(): CLIMetadata {
	if (cachedMetadata) {
		return cachedMetadata;
	}

	const installMethod = detectInstallMethod();
	const runtime = getRuntimeInfo();

	cachedMetadata = {
		version: CLI_VERSION,
		hash: CLI_HASH,
		arch: process.arch,
		platform: process.platform === 'win32' ? 'windows' : process.platform,
		runtime: runtime.runtime,
		extraRuntimeData: runtime.nodeVersion ? `(emulating node ${runtime.nodeVersion})` : '',
		installMethod,
		get fullVersionString() {
			return `apify-cli/${this.version} (${this.hash.slice(0, 7)}) running on ${this.platform}-${this.arch} with ${this.runtime}-${runtime.version}${this.extraRuntimeData ? ` ${this.extraRuntimeData}` : ''}, installed via ${this.installMethod}`;
		},
	};

	if (installMethod === 'bundle') {
		cachedMetadata.installPath = dirname(process.execPath);
	}

	return cachedMetadata;
}
