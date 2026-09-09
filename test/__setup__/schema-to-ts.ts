/**
 * Shared by the schema-to-ts tests that compare against a checked-in `.ts` fixture.
 *
 * The expected files are real `.ts` in this repo, so the repo's formatter owns their layout:
 * tabs, unions broken across lines with a leading pipe, single-quoted literals, and none of the
 * parentheses the emitter puts around every intersection. That is the point — a generated file
 * lives in a repo with a formatter — so compare only what a formatter cannot touch. The exact
 * bytes the emitter writes are emit.test.ts's business.
 */
export function significant(source: string): string {
	return source
		.replace(/^\/\/ oxlint-disable\r?\n/, '')
		.replace(/'([^']*)'/g, '"$1"')
		.replace(/[()]/g, '')
		.replace(/\s+/g, ' ')
		.replace(/ ?([{}<>|;:,&?=]) ?/g, '$1')
		.replace(/([:=<])\|/g, '$1')
		.trim();
}

/** Diagnostics and notices counted by code, so a case can state the fidelity it knows it loses. */
export function tally(items: { code: string }[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const { code } of items) counts[code] = (counts[code] ?? 0) + 1;
	return counts;
}
