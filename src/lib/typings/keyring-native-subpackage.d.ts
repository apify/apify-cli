// The specifier below is a build-time placeholder. `scripts/build-cli-bundles.ts`
// rewrites it to the platform-specific `@napi-rs/keyring-<target>` subpackage for each
// compiled bundle, so Bun's `--compile` embeds that one native `.node`. Outside bundles
// the import is never executed. This declaration just keeps tsc/oxlint happy.
//
// The type is sourced from the `@napi-rs/keyring` wrapper, which is decoupled from runtime
// resolution (the bundle rewrites the specifier in the fat JS; the `.d.ts` is never read by
// the bundler). The wrapper re-exports the same NAPI `Entry` the native subpackage binds, so
// this stays accurate for free. Re-exporting from the subpackage itself wouldn't work — those
// ship only the `.node` binary with no `.d.ts`, so `Entry` would silently degrade to `any`.
declare module '__APIFY_KEYRING_NATIVE_SUBPACKAGE__' {
	export type { Entry } from '@napi-rs/keyring';
}
