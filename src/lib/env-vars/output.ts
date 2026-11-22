import chalk from 'chalk';

import { CompactMode, ResponsiveTable } from '../commands/responsive-table.js';
import type { PlatformEnvVar } from './platform.js';
import type { EnvTarget } from './target.js';

/** `username/actor version 0.0` */
export function describeTarget(target: EnvTarget): string {
	return `${target.actorLabel} version ${target.versionNumber}`;
}

/** The fields every `apify env` command puts in its --json output. */
export function targetJson(target: EnvTarget): { actor: { id: string; name: string }; version: string } {
	return { actor: { id: target.actor.id, name: target.actorLabel }, version: target.versionNumber };
}

/** A table of names, types, and plain values. A secret's value is never shown. */
export function renderEnvVarTable(envVars: PlatformEnvVar[]): string {
	const table = new ResponsiveTable({
		allColumns: ['Name', 'Type', 'Value'],
		mandatoryColumns: ['Name', 'Type', 'Value'],
	});

	for (const envVar of envVars) {
		table.pushRow({
			Name: chalk.cyan(envVar.name),
			Type: envVar.isSecret ? 'secret' : 'plain',
			Value: envVar.isSecret ? chalk.gray('hidden') : (envVar.value ?? ''),
		});
	}

	return table.render(CompactMode.WebLikeCompact);
}
