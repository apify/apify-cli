import type { PlatformEnvVar } from './platform.js';

export type EnvVarComparisonStatus =
	/** In .env, not on the platform. */
	| 'onlyLocal'
	/** On the platform, not in .env. */
	| 'onlyPlatform'
	/** Plain on the platform, and the .env value differs. */
	| 'differs'
	/** Plain on the platform, with the same value. */
	| 'same'
	/** Secret on the platform and present in .env: matched by name only. */
	| 'secret';

export interface EnvVarComparison {
	name: string;
	status: EnvVarComparisonStatus;
	/** The platform type; false for onlyLocal. */
	isSecret: boolean;
	/** The key is in .env with an empty value. */
	localEmpty: boolean;
}

const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** Compares .env with the platform variables, sorted by name. Never carries values. */
export function compareEnvVars(local: Record<string, string>, platform: PlatformEnvVar[]): EnvVarComparison[] {
	const comparison: EnvVarComparison[] = [];
	const platformNames = new Set<string>();

	for (const envVar of platform) {
		platformNames.add(envVar.name);
		const inLocal = Object.hasOwn(local, envVar.name);

		let status: EnvVarComparisonStatus;
		if (!inLocal) status = 'onlyPlatform';
		else if (envVar.isSecret) status = 'secret';
		else status = envVar.value === local[envVar.name] ? 'same' : 'differs';

		comparison.push({
			name: envVar.name,
			status,
			isSecret: envVar.isSecret,
			localEmpty: inLocal && !local[envVar.name],
		});
	}

	for (const [name, value] of Object.entries(local)) {
		if (platformNames.has(name)) continue;
		comparison.push({ name, status: 'onlyLocal', isSecret: false, localEmpty: !value });
	}

	return comparison.sort(byName);
}

export type EnvPushAction = 'add' | 'update' | 'replace-secret' | 'remove' | 'unchanged' | 'skip-empty' | 'keep';

export interface EnvPushStep {
	name: string;
	action: EnvPushAction;
	/** The type after the push: the platform type for existing variables, !plain for new ones. */
	isSecret: boolean;
}

const planStep = ({ status, localEmpty }: EnvVarComparison, { prune }: { prune: boolean }): EnvPushAction => {
	switch (status) {
		case 'onlyLocal':
			return localEmpty ? 'skip-empty' : 'add';
		case 'differs':
			return localEmpty ? 'skip-empty' : 'update';
		case 'secret':
			return localEmpty ? 'skip-empty' : 'replace-secret';
		case 'same':
			return 'unchanged';
		case 'onlyPlatform':
		default:
			return prune ? 'remove' : 'keep';
	}
};

/** What `apify env push` does with each variable, in the order of the comparison. Names and types only. */
export function planEnvPush(
	comparison: EnvVarComparison[],
	options: { prune: boolean; plain: boolean },
): EnvPushStep[] {
	return comparison.map((entry) => ({
		name: entry.name,
		action: planStep(entry, options),
		isSecret: entry.status === 'onlyLocal' ? !options.plain : entry.isSecret,
	}));
}

const WRITE_ORDER: Partial<Record<EnvPushAction, number>> = { 'add': 0, 'update': 1, 'replace-secret': 1, 'remove': 2 };

/** The steps that write, in the order `apify env push` applies them: adds, then updates, then removals. */
export function envPushWrites(steps: EnvPushStep[]): EnvPushStep[] {
	return steps
		.filter((step) => WRITE_ORDER[step.action] !== undefined)
		.sort((a, b) => WRITE_ORDER[a.action]! - WRITE_ORDER[b.action]! || byName(a, b));
}
