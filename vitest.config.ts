import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { resolve } from 'path';

export default defineConfig({
	define: {
		global: 'globalThis'
	},
	plugins: [
		sveltekit(),
		svelteTesting(),
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
		environmentOptions: {
			jsdom: {
				url: 'http://localhost/'
			}
		},
		// Setup file for test environment configuration
		setupFiles: ['./vitest-setup-client.ts'],
		// Include test files
		include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}', 'src/**/__tests__/**/*.{js,ts,jsx,tsx}'],
		// Exclude files
		exclude: [
			'node_modules',
			'dist',
			'.idea',
			'.git',
			'.svelte-kit',
			'build',
			'src/lib/tests/e2e',
			'src/lib/tests/_pending'
		],
		// Globals available in tests
		globals: true,
		env: {
			BROWSER: 'true'
		},
		server: {
			deps: {
				inline: ['@testing-library/svelte']
			}
		},
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
		conditions: ['browser', 'development'],
		alias: {
			$lib: resolve(__dirname, './src/lib'),
			$app: resolve(__dirname, './.svelte-kit/runtime/app'),
			'$app/environment': resolve(__dirname, './src/lib/mocks/app-environment.ts')
		}
	},
	ssr: {
		noExternal: ['@testing-library/svelte', '@testing-library/svelte-core']
	}
});
