import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const bolt11Shim = resolve(projectRoot, 'src/lib/shims/bolt11.ts');
const cryptoShim = resolve(projectRoot, 'src/lib/shims/crypto.ts');

export default defineConfig(({ mode }) => {
	// Load .env file variables into process.env so build-time plugins (e.g. Sentry)
	// can read them via process.env. Vite only exposes .env to import.meta.env inside
	// source files — it does NOT populate process.env before evaluating vite.config.ts.
	// Using '' as prefix loads ALL variables (not just VITE_* ones).
	const env = loadEnv(mode, process.cwd(), '');
	Object.assign(process.env, env);
	const sentryUploadRequested =
		process.env.SENTRY_UPLOAD === 'true' || process.env.CI === 'true' || process.env.CI === '1';
	const sentryEnabled = Boolean(
		sentryUploadRequested &&
			process.env.SENTRY_AUTH_TOKEN &&
			process.env.SENTRY_ORG &&
			process.env.SENTRY_PROJECT
	);

	return {
		test: {
			environment: 'jsdom',
			setupFiles: ['./vitest-setup-client.ts'],
			globals: true,
			exclude: [
				'**/_pending/**',
				'**/e2e/**',
				'tests/e2e/**',
				'src/lib/tests/e2e/**',
				'tests/scripts/**',
				'**/*.e2e.test.ts',
				'**/*.e2e.test.tsx',
				'node_modules/**'
			],
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
				bolt11: bolt11Shim,
				crypto: cryptoShim,
				buffer: 'buffer',
				stream: 'stream-browserify',
				process: 'process/browser',
				'$app/environment': new URL('./src/lib/mocks/app-environment.ts', import.meta.url).pathname
			}
		},
		ssr: {
			// Bundle wallet-core through Vite's SSR pipeline so Vite handles its
			// JSON imports (boltz-core/out/EtherSwap.sol/EtherSwap.json) natively.
			// Without this, Node.js v26 loads the package directly and requires
			// `import ... with { type: 'json' }` assertions that aren't present.
			noExternal: ['@bittasker/wallet-core']
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
				include: ['stream', 'buffer', 'util', 'process', 'events'],
				// Explicitly exclude modules that should not be polyfilled
				// IMPORTANT: Do NOT include 'fs' or 'path' as they break WASM loading
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
			//    Keep it last only when a real upload is configured;
			//    local/CI preview builds should not pay the source-map/upload cost without credentials.
			...(sentryEnabled
				? [
						sentrySvelteKit({
							org: process.env.SENTRY_ORG,
							project: process.env.SENTRY_PROJECT,
							authToken: process.env.SENTRY_AUTH_TOKEN,
							sentryUrl: process.env.SENTRY_URL ?? 'https://gt.bittasker.com',
							telemetry: false,
							autoInstrument: {
								load: false, // Disable auto-instrumentation for client-side only app
								serverLoad: false
							}
						})
					]
				: [])
		],
		define: {
			__APP_VERSION__: JSON.stringify(pkg.version),
			// Unique per-build identifier for version-scoped sessionStorage keys.
			// Priority: Workers Builds → GitLab CI → timestamp fallback.
			__BUILD_VERSION__: JSON.stringify(
				process.env.WORKERS_CI_COMMIT_SHA ?? process.env.CI_COMMIT_SHA ?? Date.now().toString()
			),
			global: 'globalThis'
		},
		build: {
			// esnext: native top-level await for secp256k1 WASM (vite-plugin-wasm).
			// Setting "esnext" tells vite-plugin-top-level-await to skip its esbuild
			// re-transform step, which breaks cross-chunk references (e.g. ProviderRpcError
			// from dependencies). The plugin still wraps TLA in async IIFEs via SWC for Safari/iOS
			// compatibility, but avoids the esbuild minify that mangles dependency references.
			target: 'esnext',

			// OXC minification is fast but significantly heavier in this repo's local/CI preview builds.
			// Keep the lighter esbuild path unless a real Sentry upload build is configured.
			minify: sentryEnabled ? ('oxc' as boolean | 'esbuild' | 'terser' | undefined) : 'esbuild',
			// Hidden source maps are only needed for Sentry uploads; skip them when no upload is configured.
			sourcemap: sentryEnabled ? 'hidden' : false,
			cssCodeSplit: true, // Enable CSS code splitting
			cssMinify: true, // Explicitly enable CSS minification (default but explicit)
			// secp256k1 WASM (~1.2 MB) and split vendor chunks (firebase, nostr-ndk) exceed 1 MB by design.
			// Aggressive manualChunks splitting breaks SvelteKit chunk ordering ("kit.start is not a function").
			chunkSizeWarningLimit: 2500,
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
						if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) {
							return 'firebase';
						}
						if (id.includes('node_modules/@nostr-dev-kit/')) {
							return 'nostr-ndk';
						}
						if (id.includes('node_modules/bip39')) {
							return 'bip39';
						}
						// Isolate the `debug` CJS module into its own chunk.
						// When merged with NDK/Dexie into a single chunk, Rollup's
						// `getDefaultExportFromCjs` returns the raw `exports` object
						// instead of the `createDebug` function, causing "b is not a
						// function" at runtime on every page.
						if (id.includes('node_modules/debug/')) {
							return 'debug';
						}
						// Isolate Svelte internals into their own chunk.
						// Without this, Vite merges Svelte's onMount/onDestroy/state/etc. with
						// NDK and axios code that has top-level await. The topLevelAwait plugin
						// then cascades __tla wrapping to the merged chunk, putting onMount inside
						// an async IIFE. On WebKit, this makes onMount undefined when SvelteKit's
						// runtime checks onMount.toString() — breaking the app on Safari/iPhone.
						if (id.includes('node_modules/svelte/src/internal')) {
							return 'svelte-internal';
						}
					}
				}
			}
		},
		optimizeDeps: {
			include: ['date-fns', 'axios', 'buffer', 'bip39'],
			exclude: ['firebase', '@capacitor/device', '@capacitor/preferences', '@capacitor/haptics']
		},
		server: {
			// For mobile live-reload (Capacitor on device) we typically load the dev server via:
			// - http://<laptop-lan-ip>:3000 (same Wi‑Fi), or
			// - http://localhost:3000 with `adb reverse`
			// Allowing all hosts prevents Vite from blocking these.
			allowedHosts: true,
			// Proxy Cloudflare Stream/Images API calls to the deployed Worker.
			// These endpoints don't exist in the SvelteKit dev server — they only
			// run on the Worker. Without the proxy, local uploads fall back to the
			// NestJS backend and video keys are not valid Stream UIDs.
			proxy: {
				'/api/cloudflare/stream': {
					target: 'https://dev.bittasker.com',
					changeOrigin: true,
					secure: true
				},
				'/api/cloudflare/images': {
					target: 'https://dev.bittasker.com',
					changeOrigin: true,
					secure: true
				},
				'/api/explorer': {
					target: 'https://dev.bittasker.com',
					changeOrigin: true,
					secure: true
				},
				// RSK RPC proxy — public-node.rsk.co blocks browser CORS;
				// in production (Capacitor) native HTTP bypasses this, but in dev mode
				// the proxy is needed for balance fetches to succeed.
				'/rpc/rsk': {
					target: 'https://public-node.rsk.co',
					changeOrigin: true,
					secure: true,
					rewrite: (path) => path.replace(/^\/rpc\/rsk/, '')
				}
			},
			watch: {
				ignored: [
					'**/.git/**',
					'**/src/lib/tests/**',
					'**/tests/**',
					'**/*.test.ts',
					'**/*.test.tsx',
					'**/*.spec.ts',
					'**/*.spec.tsx',
					'**/coverage/**',
					'**/test-results/**',
					'.playwright-mcp/**',
					'scripts/**',
					'status/**',
					'.storybook/**',
					'android/**',
					'ios/**',
					'requirements/**',
					// Tooling directories — prevent hot reloads from Claude/Ruflo/IDE writes
					'**/.claude-flow/**',
					'**/.swarm/**',
					'**/.gitnexus/**',
					'**/.svelte-kit/**',
					'**/.wrangler/**',
					'**/.ts-morph-cache/**',
					'**/agentdb.rvf*',
					'**/ruvector.db*',
					'**/.idea/**',
					'**/.vscode/**',
					'**/.cursor/**',
					'**/.gemini/**',
					'**/.codex-plan-loop/**',
					'**/.claude-plugin/**',
					'**/.gitlab/**',
					'**/.husky/**',
					// Actively written during Claude sessions
					'**/data/memory/**',
					// Claude project-local config (hooks, skills, settings)
					'**/.claude/**',
					// E2E test artifacts (generated while dev server runs)
					'**/playwright-report/**',
					// Kilo Code / OpenCode tooling — prevent hot reloads from agent writes
					'**/.kilo/**',
					'**/.kilocode/**',
					'**/.opencode/**',
					// Kilo config file (frequently written by agent)
					'**/kilo.json',
					// Other tooling configs at project root
					'**/claude-flow.config.json',
					'**/.mcp.json'
				]
			}
		}
	};
});
