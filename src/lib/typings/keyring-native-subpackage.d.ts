// The specifier below is a build-time placeholder. `scripts/build-cli-bundles.ts`
// rewrites it to the platform-specific `@napi-rs/keyring-<target>` subpackage for each
// compiled bundle, so Bun's `--compile` embeds that one native `.node`. Outside bundles
// the import is never executed. This declaration just keeps tsc/oxlint happy.
declare module '__APIFY_KEYRING_NATIVE_SUBPACKAGE__' {
	export class Entry {
		constructor(service: string, account: string);
		getPassword(): string | null;
		setPassword(password: string): void;
		deletePassword(): boolean;
	}
}
