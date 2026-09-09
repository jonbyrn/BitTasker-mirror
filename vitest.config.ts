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
		environment: 'jsdom',
		environmentOptions: {
			jsdom: {
				url: 'http://localhost/'
			}
		},
		setupFiles: ['./vitest-setup-client.ts'],
		globals: true,
		env: {
			BROWSER: 'true'
		},
		projects: [
			{
				extends: true,
				test: {
					name: 'unit-parallel',
					include: ['src/lib/tests/**/*.test.ts'],
					exclude: [
						'**/nostr/**',
						'**/helpers/nostr.query.test.ts',
						'**/service-quote/notifications.test.ts',
						'**/stores/auth.store.test.ts',
						'**/routes/services-network-failure.test.ts',
						'**/services-page.edge-cases.test.ts',
						'**/services-page.major-fixes.test.ts',
						'**/services-perf.smoke.test.ts'
					],
					pool: 'threads',
					poolOptions: {
						threads: {
							maxThreads: 2,
							minThreads: 1
						}
					}
				}
			},
			{
				extends: true,
				test: {
					name: 'nostr-serial',
					testTimeout: 30000,
					include: [
						'src/lib/tests/**/nostr/**/*.test.ts',
						'src/lib/tests/**/helpers/nostr.query.test.ts',
						'src/lib/tests/**/service-quote/notifications.test.ts',
						'src/lib/tests/**/stores/auth.store.test.ts',
						'src/lib/tests/**/routes/services-network-failure.test.ts',
						'src/lib/tests/**/services-page.edge-cases.test.ts',
						'src/lib/tests/**/services-page.major-fixes.test.ts'
					],
					fileParallelism: false,
					maxConcurrency: 1
				}
			}
		],
		server: {
			deps: {
				inline: ['@testing-library/svelte', '@sentry/sveltekit']
			}
		},
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
		testTimeout: 10000,
		hookTimeout: 10000
	},
	resolve: {
		conditions: ['browser', 'development'],
		alias: [
			// SvelteKit app mocks
			{
				find: '$app/environment',
				replacement: resolve(__dirname, './src/lib/mocks/app-environment.ts')
			},
			{ find: '$app/stores', replacement: resolve(__dirname, './src/lib/mocks/app-stores.ts') },
			{
				find: '$app/navigation',
				replacement: resolve(__dirname, './src/lib/mocks/app-navigation.ts')
			},
			{ find: '$app/state', replacement: resolve(__dirname, './src/lib/mocks/app-state.ts') },
			{ find: '$app/forms', replacement: resolve(__dirname, './src/lib/mocks/app-navigation.ts') },
			{ find: '$app/paths', replacement: resolve(__dirname, './src/lib/mocks/app-navigation.ts') },
			{ find: '$app/server', replacement: resolve(__dirname, './src/lib/mocks/app-navigation.ts') },
			// Project aliases
			{ find: '$lib', replacement: resolve(__dirname, './src/lib') },
			{ find: 'bolt11', replacement: resolve(__dirname, './src/lib/shims/bolt11.ts') },
			{ find: 'crypto', replacement: resolve(__dirname, './src/lib/shims/crypto.ts') }
		]
	},
	ssr: {
		noExternal: ['@testing-library/svelte', '@testing-library/svelte-core']
	}
});
