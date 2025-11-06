import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import houdini from 'houdini/vite';
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { resolve } from 'path';

export default defineConfig({
	plugins: [
		sveltekit(),
		houdini(),
		tailwindcss(),
		wasm(),
		topLevelAwait(),
		Icons({
			compiler: 'svelte',
			autoInstall: false,
			scale: 1.5,
			defaultClass: ''
		})
	],
	test: {
		// Use jsdom for component tests that need DOM APIs
		environment: 'jsdom',
		// Setup file for test environment configuration
		setupFiles: ['./vitest-setup-client.ts'],
		// Include test files
		include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}', 'src/**/__tests__/**/*.{js,ts,jsx,tsx}'],
		// Exclude files
		exclude: ['node_modules', 'dist', '.idea', '.git', '.svelte-kit', 'build'],
		// Globals available in tests
		globals: true,
		// Coverage configuration
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/**/*.{js,ts,svelte}'],
			exclude: [
				'node_modules/',
				'src/**/*.d.ts',
				'src/**/*.stories.{js,ts,svelte}',
				'src/**/__tests__/**',
				'src/**/*.test.{js,ts}',
				'src/**/*.spec.{js,ts}'
			],
			thresholds: {
				global: {
					branches: 70,
					functions: 70,
					lines: 70,
					statements: 70
				}
			}
		},
		// Test timeout
		testTimeout: 10000,
		// Hook timeout
		hookTimeout: 10000
	},
	resolve: {
		alias: {
			$lib: resolve(__dirname, './src/lib'),
			$app: resolve(__dirname, './.svelte-kit/runtime/app')
		}
	}
});

