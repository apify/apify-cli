export interface PlatformEnvVar {
	name: string;
	isSecret: boolean;
	value?: string;
}

export interface EnvDiff {
	onlyInDotEnv: string[];
	onlyOnPlatform: string[];
	differentValues: string[];
}

/**
 * Compares the variables in `.env` with those of an Actor version. Secrets are matched by name only, because their
 * values can't be read back from the platform.
 */
export function diffEnvVars(dotEnv: Record<string, string>, platform: PlatformEnvVar[]): EnvDiff {
	const platformByName = new Map(platform.map((envVar) => [envVar.name, envVar]));
	const onlyInDotEnv: string[] = [];
	const differentValues: string[] = [];

	for (const [name, value] of Object.entries(dotEnv)) {
		const platformEnvVar = platformByName.get(name);

		if (!platformEnvVar) {
			onlyInDotEnv.push(name);
		} else if (!platformEnvVar.isSecret && platformEnvVar.value !== value) {
			differentValues.push(name);
		}
	}

	const onlyOnPlatform = platform.filter((envVar) => !Object.hasOwn(dotEnv, envVar.name)).map((envVar) => envVar.name);

	return {
		onlyInDotEnv: onlyInDotEnv.sort(),
		onlyOnPlatform: onlyOnPlatform.sort(),
		differentValues: differentValues.sort(),
	};
}
