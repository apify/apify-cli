export interface StringMatcherTemplate {
	testActorName?: string;
	buildId?: string;
}

export function replaceMatchersInString(str: string, matchers: StringMatcherTemplate): string {
	for (const [key, replaceValue] of Object.entries(matchers) as [keyof StringMatcherTemplate, string][]) {
		str = str.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), replaceValue);
	}

	return str;
}
