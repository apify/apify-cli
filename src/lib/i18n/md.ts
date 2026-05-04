/**
 * Tag a template literal as the source string of a message variant. Returns
 * its input unchanged at runtime, but the `<const T extends string>`
 * generic captures the literal at the type level — combined with the
 * identity-typed {@link Colors} interface, this is what lets
 *
 *   ```ts
 *   markdown: (colors) => md(`hi ${colors.bold('{actorName}')}!`)
 *   ```
 *
 * surface `{ actorName: string }` to `t()`'s call site.
 *
 * Without this wrapper TypeScript widens the template literal to `string` as
 * soon as it interpolates a non-literal expression — even when that
 * expression's static type is itself a literal — so the placeholder names
 * would be lost.
 */
export function md<const T extends string>(template: T): T {
	return template;
}
