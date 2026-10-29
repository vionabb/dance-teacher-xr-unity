import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { readMetricRelease } from './src/lib/server/chi25-metric-release.js';
import Icons from 'unplugin-icons/vite';

export default defineConfig({
	define: { __RESEARCH_METRIC_RELEASE__: JSON.stringify(readMetricRelease(process.cwd()).id) },
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
				// additionalData: '@use "sass:math";'
			}
		}
	}
});
