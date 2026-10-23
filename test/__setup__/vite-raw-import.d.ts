/**
 * Vite (and so Vitest) serves a `?raw` import as the file's text. Declared here rather than by
 * pulling in `vite/client`, which would drop every asset and worker wildcard into the test project.
 */
declare module '*?raw' {
	const source: string;
	export default source;
}
