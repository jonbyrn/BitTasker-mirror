import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { realpathSync, existsSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import commonjs from 'vite-plugin-commonjs';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import pkg from './package.json';
import wasm from 'vite-plugin-wasm';
import Icons from 'unplugin-icons/vite';
import tailwindcss from '@tailwindcss/vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const bolt11Shim = resolve(projectRoot, 'src/lib/shims/bolt11.ts');

function norm(p: string): string {
	return p.replaceAll('\\', '/');
}

const require = createRequire(import.meta.url);
function resolvePackageRoot(packageName: string): string {
	try {
		return dirname(realpathSync(require.resolve(`${packageName}/package.json`)));
	} catch {
		return realpathSync(resolve(projectRoot, 'node_modules', packageName));
	}
}

const rgbSdkWebRoot = resolvePackageRoot('@utexo/rgb-sdk-web');
const rlnWasmRoot = resolvePackageRoot('@utexo/rln-wasm');
const rgbLibWasmRoot = resolvePackageRoot('@utexo/rgb-lib-wasm');

// @noble/hashes ships CJS at its package root and ESM under esm/. Bare specifiers
// like "@noble/hashes/sha256" need redirecting to the esm/ files — otherwise
// @rollup/plugin-commonjs wraps the CJS copy in a lazy require() wrapper whose
// init call gets eliminated by minifiers (see qrcode's identical bug below).
//
// Multiple @noble/hashes versions coexist in this dependency tree (pnpm nests a
// different version per consumer when semver ranges diverge — v1.x and v2.x have
// incompatible abytes() signatures). A naive global redirect to one resolved
// package root would silently swap a different version into some importers,
// producing generic "Uint8Array expected of length ,message" assertion failures.
// Resolving through `this.resolve(source, importer)` first lets Rollup/pnpm pick
// the correct version for THAT importer; only then do we redirect within that
// same version's directory to its esm/ counterpart.
function nobleHashesEsm(): Plugin {
	return {
		name: 'noble-hashes-esm',
		enforce: 'pre',
		load(id) {
			const normalized = norm(id).split('?')[0];
			if (normalized.includes('\0')) return null;
			if (!normalized.includes('/@noble/hashes/') || normalized.includes('/@noble/hashes/esm/')) {
				return null;
			}
			if (!normalized.endsWith('.js')) return null;

			const esmPath = normalized.replace(/\/\@noble\/hashes\//, '/@noble/hashes/esm/');
			return existsSync(esmPath) ? readFileSync(esmPath, 'utf-8') : null;
		}
	};
}


function nobleRelativeEsm(): Plugin {
	return {
		name: 'noble-relative-esm',
		enforce: 'pre',
		resolveId(source, importer) {
			if (!importer) return null;

			const normalizedImporter = norm(importer).split('?')[0];
			if (
				!source.startsWith('.') ||
				!normalizedImporter.includes('/@noble/hashes/') ||
				normalizedImporter.includes('/@noble/hashes/esm/')
			) {
				return null;
			}

			const absolutePath = norm(resolve(dirname(importer), source));
			const esmPath = absolutePath.replace(/\/\@noble\/hashes\//, '/@noble/hashes/esm/');
			const esmFile = esmPath.endsWith('.js') ? esmPath : `${esmPath}.js`;
			return existsSync(esmFile) ? esmFile : null;
		}
	};
}

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

function clientResolveAliases(): Plugin {
	const bitcoinjsShim = resolve(projectRoot, 'src/lib/shims/bitcoinjs-lib.ts');
	const eventsShim = resolve(projectRoot, 'src/lib/shims/events.ts');
	const lruCacheShim = resolve(projectRoot, 'src/lib/shims/typescript-lru-cache.ts');
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

			// Force bare 'events' (and 'node:events') to the ESM shim so NDK's
			// `class NDKRelay extends EventEmitter` binds a real constructor at
			// module-init time, not the lazily-populated CJS interop namespace.
			// Must run enforce:'pre' to beat nodePolyfills and commonjs interop.
			if (source === 'events' || source === 'node:events') {
				return { id: eventsShim };
			}
			if (source === 'tseep') {
				return { id: eventsShim };
			}
			if (source === 'typescript-lru-cache') {
				return { id: lruCacheShim };
			}

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
					// Let Vite optimize the bare bitcoinjs-lib package entry.
					if (pkg === 'bitcoinjs-lib') return undefined;
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

function rewriteUtexoWasmUrls(): Plugin {
	return {
		name: 'rewrite-utexo-wasm-urls',
		enforce: 'pre',
		transform(code, id) {
			if (!id.includes('@utexo')) return null;
			let updatedCode = code;
			if (code.includes('rln_wasm_sdk_bg.wasm')) {
				updatedCode = updatedCode.replace(
					/new\s+URL\(\s*['"]rln_wasm_sdk_bg\.wasm['"]\s*,\s*import\.meta\.url\s*\)/g,
					"'/wasm/rln_wasm_sdk_bg.wasm'"
				);
			}
			if (code.includes('rgb_lib_wasm_bindings_bg.wasm')) {
				updatedCode = updatedCode.replace(
					/new\s+URL\(\s*['"]rgb_lib_wasm_bindings_bg\.wasm['"]\s*,\s*import\.meta\.url\s*\)/g,
					"'/wasm/rgb_lib_wasm_bindings_bg.wasm'"
				);
			}
			return { code: updatedCode, map: null };
		}
	};
}

// qrcode's format-info.js/version.js compute a BCH digit via a cross-module
// CJS singleton (Utils.getBCHDigit) at module-init time. esbuild/oxc/terser
// all strip that singleton's init call as dead code once bundled, leaving
// Utils.getBCHDigit undefined at runtime. These patched copies inline the
// (tiny, pure) getBCHDigit function instead. resolve.alias can't target
// these — it matches the specifier as written ("./format-info"), not the
// resolved absolute path — so a resolveId hook is used instead.
function patchQrcodeBCHDigit(): Plugin {
	const shimDir = resolve(projectRoot, 'src/lib/shims');
	const patches: Record<string, string> = {
		'format-info': resolve(shimDir, 'qrcode-format-info.js'),
		version: resolve(shimDir, 'qrcode-version.js')
	};
	// The shims live outside node_modules (real ESM, not CJS-transformed), but
	// still need to import qrcode's other lib/core/*.js files by relative
	// specifier. Resolve those against qrcode's actual installed location.
	const qrcodeCoreDir = dirname(require.resolve('qrcode/lib/core/utils.js'));
	return {
		name: 'patch-qrcode-bch-digit',
		enforce: 'pre',
		resolveId(source, importer) {
			if (importer && Object.values(patches).includes(importer) && source.startsWith('./')) {
				return resolve(qrcodeCoreDir, source);
			}
			if (!importer || !/[\\/]qrcode[\\/]lib[\\/]core[\\/]/.test(importer)) return null;
			for (const [name, shimPath] of Object.entries(patches)) {
				if (source === `./${name}`) return shimPath;
			}
			return null;
		}
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
				{
					find: '@utexo/rgb-sdk-web',
					replacement: resolve(projectRoot, 'node_modules/@utexo/rgb-sdk-web/dist/index.mjs')
				},
				{ find: /^crypto$/, replacement: 'crypto-browserify' },
				{ find: /^stream$/, replacement: 'stream-browserify' },
				{ find: /^buffer$/, replacement: resolve(projectRoot, 'src/lib/shims/buffer-pkg.js') },
				{ find: /^safe-buffer$/, replacement: resolve(projectRoot, 'src/lib/shims/buffer-pkg.js') },
				{ find: /bitcoinjs-lib[\\/]src[\\/]ops\.js$/, replacement: resolve(projectRoot, 'src/lib/shims/bitcoinjs-ops.cjs') },
				{ find: /^bitcoin-ops$/, replacement: resolve(projectRoot, 'src/lib/shims/bitcoin-ops.cjs') },
				{ find: /^util$/, replacement: 'util/' },
				{ find: /^vm$/, replacement: 'vm-browserify' },
				{ find: /^events$/, replacement: resolve(projectRoot, 'src/lib/shims/events.ts') },
				{ find: /^node:events$/, replacement: resolve(projectRoot, 'src/lib/shims/events.ts') },
				{ find: /^tseep$/, replacement: resolve(projectRoot, 'src/lib/shims/events.ts') },
				{ find: /^typescript-lru-cache$/, replacement: resolve(projectRoot, 'src/lib/shims/typescript-lru-cache.ts') },
				{ find: /^process$/, replacement: 'process/browser' },
				...(process.env.VITEST
					? [{ find: /^\$app\/environment$/, replacement: new URL('./src/lib/mocks/app-environment.ts', import.meta.url).pathname }]
					: []),
			]
		},
		ssr: {
			noExternal: [
				'@bittasker/wallet-core',
				'@noble/curves',
				'@noble/secp256k1',
				'@noble/hashes',
			],
			external: [
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
			{
				name: 'script-ops-patch',
				enforce: 'pre',
				transform(code, id) {
					const n = String(id).replaceAll('\\', '/').split('?')[0];
					if (!n.includes('/bitcoinjs-lib/')) return null;
					const isScript = n.endsWith('/src/script.js');
					const isOps = n.endsWith('/src/ops.js');
					if (!isScript && !isOps) return null;
					const opsPath = resolve(projectRoot, 'src/lib/shims/bitcoin-ops.cjs');
					const opsModule = require(opsPath);
					const ops = {};
					const src = opsModule.OPS && opsModule.OPS.OP_RESERVED == null ? opsModule.OPS : opsModule;
					for (const [key, value] of Object.entries(src)) {
						if (typeof value === 'number' || typeof value === 'string') ops[key] = value;
					}
					const opsJson = JSON.stringify(ops);
					if (isOps) {
						const epilogue =
							'\nvar __OPS_LITERAL = ' + opsJson + ';\n' +
							'exports.OPS = __OPS_LITERAL;\n' +
							'exports.SCRIPT_OPS_PATCH = true;\n' +
							'if (typeof module !== "undefined" && module.exports) {\n' +
							'  module.exports.OPS = __OPS_LITERAL;\n' +
							'}\n';
						return { code: code + epilogue, map: null };
					}

					const epilogue =
						'\nvar __OPS_LITERAL_S = ' + opsJson + ';\n' +
						'Object.defineProperty(exports, "OPS", { value: __OPS_LITERAL_S, writable: true, enumerable: true, configurable: true });\n' +
						'if (typeof module !== "undefined" && module.exports) {\n' +
						'  Object.defineProperty(module.exports, "OPS", { value: __OPS_LITERAL_S, writable: true, enumerable: true, configurable: true });\n' +
						'}\n';
					return { code: code + epilogue, map: null };
				}
			},
			ssrNodeBuiltins(),
			clientResolveAliases(),
			cjsEsmInterop(),
			{
				name: 'buffer-real-impl',
				enforce: 'pre',
				resolveId(source) {
					if (source === 'buffer-real-impl') {
						return require.resolve('buffer/index.js');
					}
					return null;
				},
				load(id) {
					const n = id.replaceAll('\\', '/').split('?')[0];
					if (n.includes('\0')) return null;
					if (n.includes('/node_modules/buffer/index.js') && !n.includes('/polyfill')) {
						return readFileSync(n, 'utf8');
					}
					return null;
				}
			},
			rewriteUtexoWasmUrls(),
			nobleHashesEsm(),
			nobleRelativeEsm(),
			patchQrcodeBCHDigit(),
			viteStaticCopy({
				targets: [
					{
						src: 'node_modules/@utexo/rln-wasm/rln_wasm_sdk_bg.wasm',
						dest: 'wasm',
						noErrorOnMissing: true
					} as Parameters<typeof viteStaticCopy>[0]['targets'][number] & { noErrorOnMissing: true },
					{
						src: 'node_modules/@utexo/rgb-lib-wasm/rgb_lib_wasm_bindings_bg.wasm',
						dest: 'wasm',
						noErrorOnMissing: true
					} as Parameters<typeof viteStaticCopy>[0]['targets'][number] & { noErrorOnMissing: true }
				]
			}),
			commonjs({
				filter: (id) => {
					const p = id.replace(/\\/g, '/');
					return (
						p.includes('/@utexo/') ||
						p.includes('/node_modules/buffer/') ||
						p.includes('/bip32/') ||
						p.includes('/ecpair/') ||
						p.includes('/bs58check/') ||
						p.includes('/bip174/') ||
						p.includes('/varuint-bitcoin/')
					);
				}
			}),
			nodePolyfills({
				include: ['crypto', 'stream', 'util', 'vm'],
				protocolImports: true,
				globals: {
					Buffer: true,
					global: true,
					process: true
				}
			}),
			sveltekit(),
			tailwindcss(),
			wasm(),
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
			'process.env': {},
			exports: {},
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
				include: [/node_modules/],
				exclude: [/tseep/, /@nostr-dev-kit/, /@noble\/hashes/],
				transformMixedEsModules: true
			},
			rollupOptions: {
				output: {
					manualChunks: (id) => {
						const normalizedId = String(id).replaceAll('\\', '/');
						if (
							normalizedId.includes('bitcoinjs-lib') ||
							normalizedId.includes('bitcoinjs-ops.cjs') ||
							normalizedId.includes('bitcoin-ops.cjs') ||
							normalizedId.includes('/bitcoin-ops/') ||
							normalizedId.includes('/bitcoin-ops@') ||
							normalizedId.includes('/shims/bitcoin') ||
							/bitcoin-ops/.test(normalizedId)
						) {
							return 'bitcoinjs';
						}
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
			esbuildOptions: {
				define: {
					global: 'globalThis'
				}
			},
			include: ['buffer', 'bip39', 'bitcoinjs-lib', 'bip32', 'ecpair'],
			needsInterop: ['bitcoinjs-lib', 'bip32', 'ecpair', 'boltz-core'],
			// rln-wasm/rgb-lib-wasm must stay unbundled: esbuild pre-bundling rewrites
			// their wasm-bindgen `import.meta.url` wasm lookups to node_modules/.vite/deps,
			// which isn't served. rewriteUtexoWasmUrls() patches any remaining
			// import.meta.url references to the /wasm/ static copy as a backstop.
			exclude: [
				'firebase',
				'@capacitor/device',
				'@capacitor/preferences',
				'@capacitor/haptics',
				'@utexo/rgb-sdk-web',
				'@utexo/rln-wasm',
				'@utexo/rgb-lib-wasm'
			]
		},
		server: {
			port: 3000,
			strictPort: true,
			allowedHosts: true,
			fs: {
				allow: [projectRoot, rgbSdkWebRoot, rlnWasmRoot, rgbLibWasmRoot]
			},
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
				'/api/explorer': { target: 'https://dev.bittasker.com', changeOrigin: true, secure: true }
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

