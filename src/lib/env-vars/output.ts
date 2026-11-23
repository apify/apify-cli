import chalk from 'chalk';

import { CompactMode, ResponsiveTable } from '../commands/responsive-table.js';
import { info } from '../outputs.js';
import type { EnvPushAction, EnvPushStep } from './diff.js';
import { envPushWrites } from './diff.js';
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

/** Shows control characters other than a newline as `\xNN`, so a name or value can't send escape sequences to the terminal. */
const escapeControlChars = (text: string) =>
	text.replace(/\p{Cc}/gu, (char) => (char === '\n' ? char : `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`));

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

const PLAN_LINES: Partial<Record<EnvPushAction, (step: EnvPushStep) => string>> = {
	'add': ({ name, isSecret }) => chalk.green(`+ ${name}${isSecret ? ' (secret)' : ''}`),
	'update': ({ name }) => chalk.yellow(`~ ${name}`),
	'replace-secret': ({ name }) => chalk.yellow(`~ ${name} (secret, replaced: secret values can't be compared)`),
	'remove': ({ name, isSecret }) => chalk.red(`- ${name}${isSecret ? ' (secret)' : ''}`),
};

/** The `apify env push` plan: names and types only, never values. */
export function renderEnvPushPlan(target: EnvTarget, steps: EnvPushStep[]): string {
	const writes = envPushWrites(steps);
	const namesWith = (action: EnvPushAction) =>
		steps
			.filter((step) => step.action === action)
			.map(({ name }) => name)
			.join(', ');

	const lines = writes.length
		? [`Changes to ${describeTarget(target)}:`, ...writes.map((step) => `  ${PLAN_LINES[step.action]!(step)}`)]
		: [`No changes to ${describeTarget(target)}.`];

	const unchanged = namesWith('unchanged');
	const skipped = namesWith('skip-empty');
	const kept = namesWith('keep');
	if (unchanged) lines.push(`Unchanged: ${unchanged}`);
	if (skipped) lines.push(`Skipped, empty in .env: ${skipped}`);
	if (kept) lines.push(`Only on the platform, kept: ${kept}. Pass --prune to delete.`);

	return lines.join('\n');
}
