/// <reference types="vitest" />

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import Icons from 'unplugin-icons/vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		Icons({
			compiler: 'svelte'
		})
	],
	worker: {
		format: 'es'
	},
	test: {
		coverage: {
			reportsDirectory: './testResults/coverage',
			reporter: ['lcov', 'text']
		}
	},
	css: {
		preprocessorOptions: {
			scss: {
				api: 'modern'
				// additionalData: '@use "sass:math";'
			}
		}
	}
});
