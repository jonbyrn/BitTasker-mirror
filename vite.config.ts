import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import pkg from './package.json';
import wasm from 'vite-plugin-wasm';
import Icons from 'unplugin-icons/vite';
import tailwindcss from '@tailwindcss/vite';
import topLevelAwait from 'vite-plugin-top-level-await';

// Vite plugin to ensure browser condition is prioritized during tests
// This fixes the "mount(...) is not available on the server" error
const addBrowserCondition: Plugin = {
	name: 'vite-plugin-browser-condition',
	config(config, { mode }) {
		if (process.env.VITEST || mode === 'test') {
			if (!config.resolve?.conditions) {
				if (!config.resolve) {
					config.resolve = {};
				}
				config.resolve.conditions = [];
			}
			// Prioritize 'browser' condition for client-side rendering in tests
			if (!config.resolve.conditions.includes('browser')) {
				config.resolve.conditions.unshift('browser');
			}
		}
	}
};

export default defineConfig(({ mode }) => {
	// Load .env file variables into process.env so build-time plugins (e.g. Sentry)
	// can read them via process.env. Vite only exposes .env to import.meta.env inside
	// source files — it does NOT populate process.env before evaluating vite.config.ts.
	// Using '' as prefix loads ALL variables (not just VITE_* ones).
	const env = loadEnv(mode, process.cwd(), '');
	Object.assign(process.env, env);

	return {
		test: {
			environment: 'jsdom',
			setupFiles: ['./vitest-setup-client.ts'],
			globals: true,
			exclude: ['**/_pending/**'],
			coverage: {
				provider: 'v8',
				reporter: ['text', 'html', 'clover', ['cobertura', { file: 'cobertura-coverage.xml' }]],
				include: ['src/**'],
				exclude: [
					'node_modules/**',
					'.svelte-kit/**',
					'build/**',
					'dist/**',
					'packages/**',
					'**/.storybook/**',
					'**/functions/**',
					'src/lib/tests/**',
					'src/stories/**',
					'**/e2e/**',
					'**/workers-site/**',
					'**/static/**',
					'**/*.test.ts',
					'**/*.test.tsx',
					'**/*.spec.ts',
					'**/*.spec.tsx',
					'vitest*.ts',
					'scripts/**'
				]
			}
		},
		resolve: {
			conditions: process.env.VITEST ? ['browser', 'development'] : ['browser', 'development'],
			alias: {
				buffer: 'buffer',
				crypto: 'crypto-browserify',
				stream: 'stream-browserify',
				process: 'process/browser',
				'$app/environment': new URL('./src/lib/mocks/app-environment.ts', import.meta.url).pathname
			}
		},
		plugins: [
			// 1. Framework core — must come first to establish the SvelteKit transform pipeline
			sveltekit(),

			// 2. Tailwind — CSS processing, needs to see the component files SvelteKit exposes
			tailwindcss(),

			// 3. WASM — sets up WASM module handling before polyfills run
			wasm(),

			// 4. Top-level await — transforms must happen before polyfills
			topLevelAwait(),

			// 5. Node polyfills — replaces Node built-ins after all transforms are done
			nodePolyfills({
				// Whether to polyfill `node:` protocol imports.
				protocolImports: true,
				// Enable polyfills for specific globals and modules.
				globals: {
					Buffer: true,
					global: true,
					process: true
				},
				// Add specific polyfills for modules required by wallet SDK
				// IMPORTANT: Do NOT include 'fs' or 'path' as they break WASM loading
				include: ['crypto', 'stream', 'buffer', 'util', 'process', 'events'],
				// Explicitly exclude modules that should not be polyfilled
				exclude: ['fs', 'path']
			}),

			// 6. Icons — asset resolution, late in the pipeline
			Icons({
				compiler: 'svelte',
				autoInstall: false,
				scale: 1.5,
				// defaultStyle: 'width: 1.5em; height: 1.5em;',
				defaultClass: ''
			}),

			// 7. addBrowserCondition — test-only config tweak, safe anywhere but keep near end
			addBrowserCondition,

			// 8. sentrySvelteKit — MUST be last: it reads the final source maps output
			//    and uploads after the adapter runs (closeBundle hook)
			sentrySvelteKit({
				org: process.env.SENTRY_ORG,
				project: process.env.SENTRY_PROJECT,
				authToken: process.env.SENTRY_AUTH_TOKEN,
				autoInstrument: {
					load: false, // Disable auto-instrumentation for client-side only app
					serverLoad: false
				}
			})
		],
		define: {
			__APP_VERSION__: JSON.stringify(pkg.version),
			// Unique per-build identifier for version-scoped sessionStorage keys.
			// CF_PAGES_COMMIT_SHA is injected automatically by Cloudflare Pages CI.
			// Falls back to a timestamp so every local build also gets a unique value.
			__BUILD_VERSION__: JSON.stringify(process.env.CF_PAGES_COMMIT_SHA ?? Date.now().toString()),
			global: 'globalThis'
		},
		build: {
			target: 'es2020',

			minify: 'oxc' as boolean | 'esbuild' | 'terser' | undefined, // Vite 7 default — types not yet updated to include 'oxc'
			sourcemap: 'hidden', // Generate source maps for Sentry without exposing them publicly
			cssCodeSplit: true, // Enable CSS code splitting
			cssMinify: true, // Explicitly enable CSS minification (default but explicit)
			// Raise threshold to suppress warnings for intentionally large vendor chunks
			// (bip39, firebase). Aggressive manualChunks splitting breaks
			// SvelteKit's internal chunk ordering and causes "kit.start is not a function".
			chunkSizeWarningLimit: 1000,
			rollupOptions: {
				output: {
					manualChunks: (id) => {
						// Isolate BaseApiService into its own chunk.
						// This prevents Vite from co-locating it with other modules that
						// transitively import service subclasses, which creates a circular
						// chunk dependency and causes "Class extends value undefined" at runtime.
						// apiService.ts has no imports from any service file so this chunk
						// is guaranteed to have no circular dependencies and will always be
						// fully evaluated before any subclass chunk executes.
						if (id.includes('src/lib/api/apiService')) {
							return 'api-base';
						}
					}
				}
			}
		},
		optimizeDeps: {
			include: ['date-fns', 'axios', 'swiper', 'buffer', 'bip39'],
			exclude: ['firebase', '@capacitor/device', '@capacitor/preferences', '@capacitor/haptics']
		},
		server: {
			// For mobile live-reload (Capacitor on device) we typically load the dev server via:
			// - http://<laptop-lan-ip>:3000 (same Wi‑Fi), or
			// - http://localhost:3000 with `adb reverse`
			// Allowing all hosts prevents Vite from blocking these.
			allowedHosts: true
		}
	};
});
