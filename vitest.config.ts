// eslint-disable-next-line import/extensions
import { defineConfig } from 'vitest/config';

const isWindows = process.platform === 'win32';
const multiplierFactor = isWindows ? 3 : 2;

export default defineConfig({
	esbuild: {
		target: 'es2022',
		keepNames: true,
	},
	test: {
		globals: true,
		restoreMocks: true,
		testTimeout: 120_000 * multiplierFactor,
		hookTimeout: 120_000 * multiplierFactor,
		include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
		passWithNoTests: true,
		silent: !process.env.NO_SILENT_TESTS,
		env: {
			APIFY_CLI_DISABLE_TELEMETRY: '1',
			APIFY_CLI_SKIP_UPDATE_CHECK: '1',
			APIFY_NO_LOGS_IN_TESTS: '1',
		},
		retry: 3,
	},
});
