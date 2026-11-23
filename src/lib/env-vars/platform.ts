import type { EnvTarget } from './target.js';
import { versionClientFor } from './target.js';

/** What the CLI knows about a platform variable. `value` is set for plain variables only. */
export interface PlatformEnvVar {
	name: string;
	isSecret: boolean;
	value?: string;
}

/** The env vars of the target version, in platform order. API errors propagate unchanged. */
export async function listPlatformEnvVars(target: EnvTarget): Promise<PlatformEnvVar[]> {
	const { items } = await versionClientFor(target).envVars().list();

	return items.map((item) => ({
		name: item.name!,
		isSecret: Boolean(item.isSecret),
		...(item.isSecret ? {} : { value: item.value ?? '' }),
	}));
}
