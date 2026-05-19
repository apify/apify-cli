import { defineConfig } from '@apify/oxlint-config';

export default defineConfig({
	ignorePatterns: ['**/dist', 'node_modules', 'coverage', 'website', '**/*.d.ts', 'test/tmp/**/*'],
	rules: {
		'no-console': 'off',
		'no-param-reassign': 'off',
		'typescript/no-explicit-any': 'off',
		'typescript/consistent-type-definitions': ['error', 'interface'],
		'typescript/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],
		'typescript/no-unused-vars': [
			'error',
			{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
		],
		'import/no-default-export': 'off',
		'typescript/consistent-return': 'off',
		'consistent-return': 'off',
	},
	overrides: [
		{
			files: ['test/**'],
			rules: {
				'no-console': 'off',
				'typescript/ban-ts-comment': 'off',
				'typescript/no-empty-function': 'off',
				'typescript/no-unused-vars': 'off',
				// Tests use the `try { await ... } catch (err) { expect(err)... }` pattern.
				// Migrating to `await expect(...).rejects.toX(...)` is out of scope for the
				// lint migration — follow-up to enable.
				'jest/no-conditional-expect': 'off',
				'vitest/no-conditional-expect': 'off',
				// A handful of helper-based tests have no direct `expect` (assertions live
				// in the helper). Same follow-up to clean up.
				'jest/expect-expect': 'off',
				'vitest/expect-expect': 'off',
				'jest/no-standalone-expect': 'off',
				'vitest/no-standalone-expect': 'off',
			},
		},
	],
});
