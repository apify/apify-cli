import prettier from 'eslint-config-prettier';
import tsEslint from 'typescript-eslint';

// eslint-disable-next-line import/extensions -- todo: the import/extensions rule should be replaced with something that can handle exports in a package.json
import apify from '@apify/eslint-config/ts';

export default [
	{
		ignores: [
			'**/dist',
			'node_modules',
			'coverage',
			'website/{build,.docusaurus}',
			'**/*.d.ts',
			'test/tmp/**/*',
			'.yarn/**/*',
		],
	},
	...apify,
	prettier,
	{
		languageOptions: {
			parser: tsEslint.parser,
			parserOptions: {
				project: 'tsconfig.eslint.json',
			},
		},
	},
	{
		plugins: {
			'@typescript-eslint': tsEslint.plugin,
		},
		rules: {
			'no-use-before-define': 'off',
			'@typescript-eslint/no-use-before-define': ['error', { functions: false }],

			'no-console': 'off',

			'no-param-reassign': 'off',
			// We have env variables with _ in their name
			'no-underscore-dangle': 'off',

			// we do default exports
			// TODO: remove once moved to yargs
			'import/no-default-export': 'off',

			'@typescript-eslint/consistent-type-imports': [
				'error',
				{
					disallowTypeAnnotations: false,
				},
			],
			'@typescript-eslint/consistent-type-definitions': ['error', 'interface'],

			// Not ideal, but we still use any for simplicity
			'@typescript-eslint/no-explicit-any': 'off',

			// '@typescript-eslint/array-type': 'error',
			// '@typescript-eslint/no-empty-object-type': 'off',
		},
	},
	{
		files: ['website/**/*'],
		rules: {
			'@typescript-eslint/no-shadow': 'off',
			'no-console': 'off',
			'no-undef': 'off',
		},
	},
	{
		files: ['src/**/*'],
		rules: {
			'no-console': 'off',
			'consistent-return': 'off',
		},
	},
	{
		files: ['test/**/*'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					'selector': "ExpressionStatement[expression.argument.arguments.0.name='LoginCommand']",
					'message': 'Use safeLogin() from test/__setup__/hooks/useAuthSetup.ts instead',
				},
			],
		},
	},
	{
		files: ['features/**/*'],
		rules: {
			'import/no-extraneous-dependencies': 'off',
		},
	},
];
