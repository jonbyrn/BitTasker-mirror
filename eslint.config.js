import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default ts.config(
	// Ignore known parser bugs
	{ ignores: ['src/routes/+page.svelte', '.kilo/**', '.deepseek/**'] },
	includeIgnoreFile(gitignorePath),
	{
		ignores: [
			'eslint.config.js',
			'svelte.config.js',
			'src/**/__tests__/mocks/**/*.svelte',
			'src/lib/tests/mocks/**/*.svelte',
			'contracts/**',
			'backend/**',
			'reviews/**',
			'docker/**',
			'scripts/**',
			'requirements/**',
			'plugins/**'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	prettier,
	// Svelte rules (without recommended spread to avoid warningFilter serialization bug)
	...svelte.configs['flat/recommended'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				__APP_VERSION__: 'readonly',
				__BUILD_VERSION__: 'readonly',
				google: 'readonly'
			}
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			},
			parserOptions: {
				project: './tsconfig.json',
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		},
		rules: {
			'svelte/no-navigation-without-resolve': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
			]
		}
	},
	{
		files: ['**/*.ts', '**/*.js'],
		ignores: ['eslint.config.js', 'svelte.config.js'],
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
			],
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		files: ['src/lib/api/functions/**/*.ts', 'src/lib/api/functions/**/*.js'],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.es6
			},
			parserOptions: {
				ecmaVersion: 2017,
				sourceType: 'module'
			}
		},
		rules: {
			quotes: ['error', 'double'],
			indent: ['error', 2],
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
			],
			'@typescript-eslint/no-explicit-any': 'warn'
		}
	}
);
