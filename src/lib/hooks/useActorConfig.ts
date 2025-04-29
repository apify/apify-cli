import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { inspect } from 'node:util';

import { err, ok, type Result } from '@sapphire/result';

import { ACTOR_SPECIFICATION_VERSION, DEPRECATED_LOCAL_CONFIG_NAME } from '../consts.js';
import { error, info, warning } from '../outputs.js';
import { getJsonFileContent, getLocalConfigPath } from '../utils.js';
import { cliDebugPrint } from '../utils/cliDebugPrint.js';
import { confirmAction } from '../utils/confirm.js';

const getDeprecatedLocalConfigPath = (cwd: string) => join(cwd, DEPRECATED_LOCAL_CONFIG_NAME);

export interface ActorConfigError {
	message: string;
	cause?: Error;
	exists: boolean;
	config: Record<string, unknown>;
}

export interface ActorConfigResult {
	exists: boolean;
	migrated: boolean;
	config: Record<string, unknown>;
}

export interface ActorConfigInput {
	cwd?: string;
	migrateConfig?: boolean;
	warnAboutOldConfig?: boolean;
}

export const cwdCache = new Map<string, ActorConfigResult>();

export async function useActorConfig(
	{ cwd = process.cwd(), migrateConfig = true, warnAboutOldConfig = true }: ActorConfigInput = {
		cwd: process.cwd(),
		migrateConfig: true,
		warnAboutOldConfig: true,
	},
): Promise<Result<ActorConfigResult, ActorConfigError>> {
	const cached = cwdCache.get(cwd);

	if (cached) {
		cliDebugPrint('useActorConfig', { cacheHit: true, config: cached });
		return ok(cached);
	}

	const newConfigPath = getLocalConfigPath(cwd);
	const deprecatedConfigPath = getDeprecatedLocalConfigPath(cwd);

	let config: Record<string, unknown> | undefined;
	let deprecatedConfig: Record<string, unknown> | undefined;

	try {
		config = getJsonFileContent(newConfigPath);
	} catch (ex) {
		return err({
			message: `Failed to read local config at path: '${newConfigPath}':`,
			cause: ex as Error,
			exists: false,
			config: {},
		});
	}

	try {
		deprecatedConfig = getJsonFileContent(deprecatedConfigPath);
	} catch (ex) {
		return err({
			message: `Failed to read local config at path: '${deprecatedConfigPath}':`,
			cause: ex as Error,
			exists: false,
			config: {},
		});
	}

	// Handle cleanup of deprecated config, we just ignore the deprecated config if both exist
	if (config && deprecatedConfig && warnAboutOldConfig) {
		await handleBothConfigVersionsFound(deprecatedConfigPath);
	}

	if (!config && !deprecatedConfig) {
		cwdCache.set(cwd, { exists: false, migrated: false, config: {} });

		return ok({ exists: false, migrated: false, config: {} });
	}

	let migrated = false;

	if (!config && deprecatedConfig && migrateConfig) {
		const migratedConfig = await handleMigrationFlow(deprecatedConfig, deprecatedConfigPath, newConfigPath);

		if (migratedConfig.isErr()) {
			return err(migratedConfig.unwrapErr());
		}

		config = migratedConfig.unwrap();
		migrated = true;
	}

	cwdCache.set(cwd, { exists: true, migrated, config: config || deprecatedConfig || {} });

	cliDebugPrint('useActorConfig', { cacheHit: false, config: cwdCache.get(cwd) });

	return ok({ exists: true, migrated, config: config || deprecatedConfig || {} });
}

async function handleBothConfigVersionsFound(deprecatedConfigPath: string) {
	const confirmed = await confirmAction({
		type: 'actor config',
		message: `The new version of Apify CLI uses the ".actor/actor.json" instead of the "apify.json" file. Since we have found both files in your Actor directory, "apify.json" will be renamed to "apify.json.deprecated". Going forward, all commands will use ".actor/actor.json". You can read about the differences between the old and the new config at https://github.com/apify/apify-cli/blob/master/MIGRATIONS.md. Do you want to continue?`,
	});

	// If users refuse to migrate, 🤷
	if (!confirmed) {
		warning({
			message:
				'The "apify.json" file present in your Actor directory will be ignored, and the new ".actor/actor.json" file will be used instead. Please, either rename or remove the old file.',
		});

		return;
	}

	try {
		await rename(deprecatedConfigPath, `${deprecatedConfigPath}.deprecated`);

		info({
			message: `The "apify.json" file has been renamed to "apify.json.deprecated". The deprecated file is no longer used by the CLI or Apify Console. If you do not need it for some specific purpose, it can be safely deleted.`,
		});
	} catch (ex) {
		if (ex instanceof Error) {
			error({
				message: `Failed to rename the deprecated "apify.json" file to "apify.json.deprecated".\n  ${ex.message || ex}`,
			});
		} else {
			error({
				message: `Failed to rename the deprecated "apify.json" file to "apify.json.deprecated".\n  ${inspect(ex, { showHidden: false })}`,
			});
		}
	}
}

// Properties from apify.json file that will me migrated to Actor specs in .actor/actor.json
const MIGRATED_APIFY_JSON_PROPERTIES = ['name', 'version', 'buildTag'];

async function handleMigrationFlow(
	deprecatedConfig: Record<string, unknown>,
	deprecatedConfigPath: string,
	configPath: string,
): Promise<Result<Record<string, unknown>, ActorConfigError>> {
	let migratedConfig = { ...deprecatedConfig };

	if (typeof migratedConfig.version === 'object') {
		migratedConfig = updateLocalConfigStructure(migratedConfig);
	}

	migratedConfig = {
		actorSpecification: ACTOR_SPECIFICATION_VERSION,
		environmentVariables: deprecatedConfig?.env || undefined,
		...MIGRATED_APIFY_JSON_PROPERTIES.reduce(
			(acc, prop) => {
				acc[prop] = deprecatedConfig[prop];
				return acc;
			},
			{} as Record<string, unknown>,
		),
	};

	const confirmed = await confirmAction({
		type: 'actor config',
		message: `The new version of Apify CLI uses the ".actor/actor.json" instead of the "apify.json" file. Your "apify.json" file will be automatically updated to the new format under ".actor/actor.json". The original file will be renamed by adding the ".deprecated" suffix. Do you want to continue?`,
	});

	if (!confirmed) {
		return err({
			message:
				'Command can not run with old "apify.json" structure. Either let the CLI auto-update it or follow the guide on https://github.com/apify/apify-cli/blob/master/MIGRATIONS.md and update it manually.',
			exists: true,
			config: migratedConfig,
		});
	}

	// If we fail to write the new config, its an error

	try {
		await mkdir(dirname(configPath), { recursive: true });
		await writeFile(configPath, JSON.stringify(migratedConfig, null, '\t'));
	} catch (ex) {
		const casted = ex as Error;

		return err({
			message: `Failed to write the new "actor.json" file to path: '${configPath}'.\n  ${casted.message || casted}`,
			exists: true,
			config: migratedConfig,
		});
	}

	// but if we fail to rename the deprecated config, its a warning, cause future runs will ignore it

	try {
		await rename(deprecatedConfigPath, `${deprecatedConfigPath}.deprecated`);
	} catch (ex) {
		const casted = ex as Error;

		warning({
			message: `Failed to rename the deprecated "apify.json" file to "apify.json.deprecated".\n  ${casted.message || casted}`,
		});
	}

	info({
		message: `The "apify.json" file has been migrated to ".actor/actor.json" and the original file renamed to "apify.json.deprecated". The deprecated file is no longer used by the CLI or Apify Console. If you do not need it for some specific purpose, it can be safely deleted. Do not forget to commit the new file to your Git repository.`,
	});

	return ok(migratedConfig);
}

/**
 * Migration for deprecated structure of apify.json to latest.
 */

function updateLocalConfigStructure(localConfig: any) {
	const updatedLocalConfig: Record<string, unknown> = {
		name: localConfig.name,
		template: localConfig.template,
		version: localConfig.version.versionNumber,
		buildTag: localConfig.version.buildTag,
		env: null,
	};

	if (localConfig.version.envVars?.length) {
		const env = {} as Record<string, string>;

		localConfig.version.envVars.forEach((envVar: { name: string; value: string }) => {
			if (envVar.name && envVar.value) {
				env[envVar.name] = envVar.value;
			}
		});

		updatedLocalConfig.env = env;
	}

	return updatedLocalConfig;
}
