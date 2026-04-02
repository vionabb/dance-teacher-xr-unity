import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import sveltePlugin from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import eslintConfigPrettier from 'eslint-config-prettier';

const sharedGlobals = {
	console: 'readonly',
	process: 'readonly',
	module: 'readonly',
	require: 'readonly',
	__dirname: 'readonly',
	__filename: 'readonly',
	window: 'readonly',
	document: 'readonly',
	navigator: 'readonly',
	fetch: 'readonly',
	setTimeout: 'readonly',
	clearTimeout: 'readonly',
	URL: 'readonly',
	Blob: 'readonly',
	Request: 'readonly',
	Response: 'readonly',
	self: 'readonly',
	performance: 'readonly'
};

export default [
	{
		ignores: [
			'.DS_Store',
			'node_modules/**',
			'build/**',
			'.svelte-kit/**',
			'package/**',
			'.vercel/**',
			'artifacts/**',
			'static/mediapipe/**',
			'testResults/**',
			'.env',
			'.env.*',
			'!.env.example',
			'pnpm-lock.yaml',
			'package-lock.json',
			'yarn.lock'
		]
	},
	js.configs.recommended,
	...tsPlugin.configs['flat/recommended'],
	...sveltePlugin.configs['flat/base'],
	...sveltePlugin.configs['flat/prettier'],
	eslintConfigPrettier,
	{
		files: ['**/*.{js,cjs,mjs,ts}'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				sourceType: 'module',
				ecmaVersion: 2020
			},
			globals: sharedGlobals
		},
		rules: {
			'no-undef': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
		}
	},
	{
		files: ['**/*.cjs'],
		rules: {
			'@typescript-eslint/no-require-imports': 'off'
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parser: svelteParser,
			parserOptions: {
				parser: tsParser,
				extraFileExtensions: ['.svelte'],
				sourceType: 'module',
				ecmaVersion: 2020
			},
			globals: sharedGlobals
		},
		rules: {
			'no-undef': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
		}
	}
];
