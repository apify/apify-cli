import chalk from 'chalk';

import { CompactMode, ResponsiveTable } from '../commands/responsive-table.js';
import { info } from '../outputs.js';
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

/**
 * Shows control characters as `\xNN`, so a name or value can't send escape sequences to the terminal. Newlines stay
 * unless `keepNewline` is false.
 */
const escapeControlChars = (text: string, { keepNewline = true } = {}) =>
	text.replace(/\p{Cc}/gu, (char) =>
		keepNewline && char === '\n' ? char : `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`,
	);

/** A name to print in a message: every control character is escaped, newlines too, so it can't print extra lines. */
export const escapeName = (name: string) => escapeControlChars(name, { keepNewline: false });

/** A table of names, types, and plain values. A secret's value is never shown. */
export function renderEnvVarTable(envVars: PlatformEnvVar[]): string {
	const table = new ResponsiveTable({
		allColumns: ['Name', 'Type', 'Value'],
		mandatoryColumns: ['Name', 'Type', 'Value'],
	});

	for (const envVar of envVars) {
		table.pushRow({
			Name: chalk.cyan(escapeControlChars(envVar.name)),
			Type: envVar.isSecret ? 'secret' : 'plain',
			Value: envVar.isSecret ? chalk.gray('hidden') : escapeControlChars(envVar.value ?? ''),
		});
	}

	return table.render(CompactMode.WebLikeCompact);
}

/** Tells the user on stderr that runs see a change only after a rebuild. */
export function printRebuildReminder(target: EnvTarget): void {
	info({
		message: `Runs use the env vars copied onto a build. Rebuild the Actor before runs see the change: apify builds create ${target.actorLabel} --version ${target.versionNumber}`,
	});
}
