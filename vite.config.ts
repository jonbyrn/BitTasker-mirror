import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
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

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const bolt11Shim = resolve(projectRoot, 'src/lib/shims/bolt11.ts');

const require = createRequire(import.meta.url);
const rgbSdkWebIsolatedModules = dirname(
	dirname(realpathSync(resolve(projectRoot, 'node_modules/@utexo/rgb-sdk-web')))
);
const bitcoinjsLibPath = require.resolve('bitcoinjs-lib', { paths: [rgbSdkWebIsolatedModules] });

const walletCoreIsolatedModules = dirname(
	dirname(realpathSync(resolve(projectRoot, 'node_modules/@bittasker/wallet-core')))
);
const boltzCoreLiquidPath = require.resolve('boltz-core/dist/lib/liquid/index.js', {
	paths: [walletCoreIsolatedModules]
});
const bitcoinjsLibTypesPath = require.resolve('bitcoinjs-lib/src/types.js', {
	paths: [walletCoreIsolatedModules]
});

const CJS_PACKAGES = [
	'bitcoinjs-lib',
	'bip32',
	'bip39',
	'bip174',
	'ecpair',
	'tiny-secp256k1',
	'varuint-bitcoin',
	'typeforce',
	'wif',
	'bitcoin-ops',
	'pushdata-bitcoin',
	'boltz-core',
	'bn.js',
	'ripemd160',
	'sha256',
	'bs58check',
];

const ESM_PACKAGES = ['@noble/hashes'];

function buildImportPattern(packages: string[]): RegExp {
	const escaped = packages.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return new RegExp(`(import\\s+)(\\w+)(\\s+from\\s*["'])(${escaped.join('|')})([^"']*["'])`, 'g');
}

function cjsEsmInterop(): Plugin {
	const cjsPattern = buildImportPattern(CJS_PACKAGES);
	const esmPattern = buildImportPattern(ESM_PACKAGES);

	return {
		name: 'cjs-esm-interop',
		enforce: 'post',
		generateBundle(_options, bundle) {
			for (const [, chunk] of Object.entries(bundle)) {
				if (chunk.type !== 'chunk') continue;
				let code = chunk.code;
				let modified = false;

				if (cjsPattern.test(code)) {
					code = code.replace(cjsPattern, ';import * as _$2 $3$4$5; const $2 = _$2.default ?? _$2;');
					modified = true;
				}

				if (esmPattern.test(code)) {
					code = code.replace(esmPattern, ';import * as _$2 $3$4$5; const $2 = _$2;');
					modified = true;
				}

				if (modified) {
					chunk.code = code;
				}
			}
		},
	};
}

function clientOnlyNodePolyfills(options: Parameters<typeof nodePolyfills>[0]): Plugin {
	const inner = nodePolyfills(options) as Plugin;
	return {
		...inner,
		name: 'client-only-node-polyfills',
		config(_config, _env) {
			return undefined;
		},
		transform(code, id, opts) {
			if (opts?.ssr) return null;
			return typeof inner.transform === 'function'
				? inner.transform.call(this, code, id, opts)
				: // @ts-expect-error
				  inner.transform?.handler?.call(this, code, id, opts);
		},
		resolveId(source, importer, opts) {
			if (opts?.ssr) return null;
			return typeof inner.resolveId === 'function'
				? inner.resolveId.call(this, source, importer, opts)
				: // @ts-expect-error
				  inner.resolveId?.handler?.call(this, source, importer, opts);
		},
	};
}

function clientResolveAliases(): Plugin {
	const bitcoinjsShim = resolve(projectRoot, 'src/lib/shims/bitcoinjs-lib.ts');
	const packageRoots: Record<string, string> = {
		'bitcoinjs-lib': dirname(require.resolve('bitcoinjs-lib/package.json', { paths: [rgbSdkWebIsolatedModules] })),
		'boltz-core': dirname(require.resolve('boltz-core/package.json', { paths: [walletCoreIsolatedModules] })),
	};
	return {
		name: 'client-resolve-aliases',
		enforce: 'pre',
		resolveId(source, importer, options) {
			// Never intercept virtual modules, icon imports, or WASM files
			if (source.startsWith('~icons/') || source.startsWith('\0') || source.endsWith('.wasm')) return null;
			if (options?.ssr) return null;

			// Intercept nested file-path imports of bitcoinjs-lib from excluded
			// dependencies (e.g. @utexo/rgb-sdk-web/node_modules/bitcoinjs-lib/src/index.js).
			// These bypass bare-specifier matching because Vite processes excluded
			// packages through a different resolution path. Route them through
			// the CJS-ESM shim so getter-based exports (Psbt, etc.) are accessible.
			const isFromShim = importer && importer.includes('shims/bitcoinjs-lib');
			if (!isFromShim && (source.includes('bitcoinjs-lib/src/index.js') || source.includes('bitcoinjs-lib/src/index.ts'))) {
				return { id: bitcoinjsShim };
			}

			for (const [pkg, root] of Object.entries(packageRoots)) {
				if (source === pkg) {
					// Bare bitcoinjs-lib imports route through the CJS-ESM shim
					if (pkg === 'bitcoinjs-lib') {
						return { id: bitcoinjsShim };
					}
					try {
						return { id: require.resolve(source, { paths: [root] }) };
					} catch {
						return undefined;
					}
				}
				if (source.startsWith(pkg + '/')) {
					// Subpath imports (e.g. bitcoinjs-lib/src/types, boltz-core/dist/lib/liquid)
					// resolve directly to real files — no shim needed for non-index paths
					try {
						return { id: require.resolve(source, { paths: [root] }) };
					} catch {
						const subPath = source.slice(pkg.length + 1);
						return { id: resolve(root, subPath) };
					}
				}
			}
			return undefined;
		},
	};
}

function ssrNodeBuiltins(): Plugin {
	const NODE_BUILTINS: Record<string, string> = {
		'crypto': 'node:crypto',
		'buffer': 'node:buffer',
		'stream': 'node:stream',
		'util': 'node:util',
		'process': 'node:process',
	};
	const SSR_EXTERNALS: Record<string, string> = {
		'bitcoinjs-lib': bitcoinjsLibPath,
		'bitcoinjs-lib/src/types': bitcoinjsLibTypesPath,
		'boltz-core/dist/lib/liquid': boltzCoreLiquidPath,
	};
	for (const pkg of CJS_PACKAGES) {
		if (!SSR_EXTERNALS[pkg]) SSR_EXTERNALS[pkg] = pkg;
	}
	return {
		name: 'ssr-node-builtins',
		enforce: 'pre',
		resolveId(source, importer, options) {
			if (source.endsWith('.wasm')) return null;
			if (!options?.ssr) return undefined;
			if (NODE_BUILTINS[source]) {
				return { id: NODE_BUILTINS[source], external: true };
			}
			if (SSR_EXTERNALS[source]) {
				return { id: SSR_EXTERNALS[source], external: true };
			}
			for (const [pkg] of Object.entries(SSR_EXTERNALS)) {
				if (source.startsWith(pkg + '/')) {
					try {
						const pkgRoot = dirname(require.resolve(pkg + '/package.json', { paths: [walletCoreIsolatedModules, rgbSdkWebIsolatedModules] }));
						const subPath = source.slice(pkg.length + 1);
						return { id: resolve(pkgRoot, subPath), external: true };
					} catch {
						return { id: source, external: true };
					}
				}
			}
			return undefined;
		},
	};
}

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
			if (!config.resolve.conditions.includes('browser')) {
				config.resolve.conditions.unshift('browser');
			}
		}
	}
};

export default defineConfig(({ mode }) => {
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
		assetsInclude: ['**/*.wasm'],
		resolve: {
			...(process.env.VITEST ? { conditions: ['browser', 'development'] } : {}),
			environments: {
				client: {
					resolve: {
						conditions: ['browser', 'development'],
					},
				},
				ssr: {
					resolve: {
						conditions: ['node', 'development'],
						externalConditions: ['node', 'development'],
					},
				},
			},
			alias: [
				{ find: /^bolt11$/, replacement: bolt11Shim },
				{ find: /^util$/, replacement: 'util/' },
				{ find: /^stream$/, replacement: 'stream-browserify' },
				{ find: /^events$/, replacement: 'events' },
				{ find: /^process$/, replacement: 'process/browser' },
				...(process.env.VITEST
					? [{ find: /^\$app\/environment$/, replacement: new URL('./src/lib/mocks/app-environment.ts', import.meta.url).pathname }]
					: []),
			]
		},
		ssr: {
			noExternal: [
				'@bittasker/wallet-core',
			],
			external: [
				'@noble/hashes',
				'bitcoinjs-lib',
				'boltz-core',
				'crypto-browserify',
				'buffer',
				'stream-browserify',
				'process/browser',
				'@utexo/rgb-sdk-web',
			],
			resolve: {
				conditions: ['node', 'development'],
				externalConditions: ['node', 'development'],
				alias: [
					{ find: /^crypto$/, replacement: 'node:crypto' },
					{ find: /^buffer$/, replacement: 'node:buffer' },
					{ find: /^stream$/, replacement: 'node:stream' },
					{ find: /^util$/, replacement: 'node:util' },
					{ find: /^process$/, replacement: 'node:process' },
				],
			},
		},
		plugins: [
			ssrNodeBuiltins(),
			clientResolveAliases(),
			cjsEsmInterop(),
			sveltekit(),
			tailwindcss(),
			wasm(),
			topLevelAwait(),
			clientOnlyNodePolyfills({
				include: ['buffer', 'process', 'stream', 'util', 'crypto'],
				globals: {
					Buffer: true,
					global: true,
				},
				protocolImports: true,
			}),
			Icons({
				compiler: 'svelte',
				autoInstall: false,
				scale: 1.5,
				defaultClass: ''
			}),
			addBrowserCondition,
			...(sentryEnabled
				? [
						sentrySvelteKit({
							org: process.env.SENTRY_ORG,
							project: process.env.SENTRY_PROJECT,
							authToken: process.env.SENTRY_AUTH_TOKEN,
							sentryUrl: process.env.SENTRY_URL ?? 'https://gt.bittasker.com',
							telemetry: false,
							autoInstrument: {
								load: false,
								serverLoad: false
							}
						})
					]
				: [])
		],
		define: {
			__APP_VERSION__: JSON.stringify(pkg.version),
			__BUILD_VERSION__: JSON.stringify(
				process.env.WORKERS_CI_COMMIT_SHA ?? process.env.CI_COMMIT_SHA ?? Date.now().toString()
			),
			global: 'globalThis'
		},
		build: {
			target: 'esnext',
			minify: sentryEnabled ? ('oxc' as boolean | 'esbuild' | 'terser' | undefined) : 'esbuild',
			sourcemap: sentryEnabled ? 'hidden' : false,
			cssCodeSplit: true,
			cssMinify: true,
			chunkSizeWarningLimit: 2500,
			commonjsOptions: {
				include: [/bitcoinjs-lib/, /node_modules/],
				transformMixedEsModules: true
			},
			rollupOptions: {
				output: {
					manualChunks: (id) => {
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
						if (id.includes('node_modules/debug/')) {
							return 'debug';
						}
						if (id.includes('node_modules/svelte/src/internal')) {
							return 'svelte-internal';
						}
					}
				}
			}
		},
		optimizeDeps: {
			include: [
				'date-fns',
				'axios',
				'buffer',
				'bip39',
				'process/browser',
				'stream-browserify'
			],
			needsInterop: ['bitcoinjs-lib'],
			exclude: [
				'firebase',
				'@capacitor/device',
				'@capacitor/preferences',
				'@capacitor/haptics',
				'@utexo/rgb-sdk-web'
			]
		},
		server: {
			port: 3000,
			strictPort: true,
			allowedHosts: true,
			proxy: {
				'/api/v1': {
					target: process.env.VITE_API_URL || 'https://api-dev.bittasker.com',
					changeOrigin: true,
					secure: false,
				},
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
				'/api/explorer': { target: 'https://dev.bittasker.com', changeOrigin: true, secure: true },
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
					'**/data/memory/**',
					'**/.claude/**',
					'**/playwright-report/**',
					'**/.kilo/**',
					'**/.kilocode/**',
					'**/.opencode/**',
					'**/kilo.json',
					'**/claude-flow.config.json',
					'**/.mcp.json'
				]
			}
		}
	};
});

