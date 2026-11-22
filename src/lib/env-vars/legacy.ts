/** A string value that refers to a secret in the local secrets store: `@` and the secret's name. */
export const SECRET_REF_PATTERN = /^@.+/;

/** Counts only, never names or values. Anything but a plain object counts 0. */
export function countLegacyEnvVars(environmentVariables: unknown): { envVarsCount: number; secretRefsCount: number } {
	if (!environmentVariables || typeof environmentVariables !== 'object' || Array.isArray(environmentVariables)) {
		return { envVarsCount: 0, secretRefsCount: 0 };
	}

	const values = Object.values(environmentVariables);
	return {
		envVarsCount: values.length,
		secretRefsCount: values.filter((value) => typeof value === 'string' && SECRET_REF_PATTERN.test(value)).length,
	};
}

/** True when actor.json has a non-empty environmentVariables object. */
export function hasLegacyEnvVars(config: Record<string, unknown> | undefined): boolean {
	return countLegacyEnvVars(config?.environmentVariables).envVarsCount > 0;
}
