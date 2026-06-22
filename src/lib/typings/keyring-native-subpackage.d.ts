// The specifier below is a build-time placeholder. `scripts/build-cli-bundles.ts`
// rewrites it to the platform-specific `@napi-rs/keyring-<target>` subpackage for each
// compiled bundle, so Bun's `--compile` embeds that one native `.node`. Outside bundles
// the import is never executed. This declaration just keeps tsc/oxlint happy.
//
// Declared by hand rather than re-exported from `@napi-rs/keyring`: the placeholder
// resolves to the `@napi-rs/keyring-<platform>` native subpackage (the module the bundle
// actually imports, bypassing the wrapper), and those subpackages ship only the `.node`
// binary with no `.d.ts`. We pin just the sync methods `credentials.ts` uses; the
// structural contract there is what guards against upstream drift.
declare module '__APIFY_KEYRING_NATIVE_SUBPACKAGE__' {
	export class Entry {
		constructor(service: string, account: string);
		getPassword(): string | null;
		setPassword(password: string): void;
		deletePassword(): boolean;
	}
}
