import houdini from 'houdini/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import Icons from 'unplugin-icons/vite';
import pkg from './package.json';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import Inspect from 'vite-plugin-inspect'

// Flags to enable heavy/dev-only plugins on demand
const isAnalyze = !!process.env.ANALYZE
const isInspect = !!process.env.VITE_INSPECT


// More info at: https://storybook.js.org/docs/writing-tests/test-addon
export default defineConfig((env) => {
    const isSsr = (env as any).isSsrBuild === true || env.mode === 'ssr' || process.argv.includes('--ssr');

    const basePlugins = [sveltekit()];
    const browserPlugins = [
        houdini(),
        tailwindcss(),
        wasm(),
        topLevelAwait(),
        Icons({
            compiler: 'svelte',
            autoInstall: false,
            scale: 1.5,
            defaultStyle: 'width: 1.5em; height: 1.5em;',
            defaultClass: '',
        }),
        isInspect && Inspect({ build: true, outputDir: '.vite-inspect' }),
        isAnalyze && visualizer({ open: false, emitFile: true, filename: 'bundle-report.html', gzipSize: true, brotliSize: true })
    ].filter(Boolean);

    return {
        plugins: isSsr ? basePlugins : [...browserPlugins, ...basePlugins],
        define: {
            __APP_VERSION__: JSON.stringify(pkg.version),
            global: 'globalThis',
        },
        build: {
            rollupOptions: {
                output: {
                    manualChunks: undefined,
                    chunkFileNames: 'chunks/[name]-[hash].js',
                    entryFileNames: 'entry/[name]-[hash].js',
                    assetFileNames: (assetInfo) => {
                        if (assetInfo.name && assetInfo.name.endsWith('.wasm')) {
                            return 'assets/[name].[ext]';
                        }
                        return 'assets/[name]-[hash].[ext]';
                    }
                }
            },
            chunkSizeWarningLimit: 500,
            minify: 'esbuild',
            cssMinify: 'esbuild',
            modulePreload: { polyfill: false },
            assetsInlineLimit: 0,
            target: 'es2020'
        },
        optimizeDeps: {
            include: [
                'date-fns',
                'zod',
                'axios',
                'swiper',
                'buffer',
                'bitcoinjs-lib',
                'bip32',
                'bip39',
                'crypto-browserify',
                'stream-browserify',
                'path-browserify',
                'process'
            ],
            exclude: [
                'firebase',
                '@breeztech/breez-sdk-liquid/web',
                '@breeztech/breez-sdk-liquid'
            ],
            esbuildOptions: {
                target: 'es2020',
                define: {
                    global: 'globalThis',
                    Buffer: 'Buffer'
                },
                mainFields: ['module', 'main'],
                resolveExtensions: ['.mjs', '.js', '.ts', '.json']
            }
        },
        server: {
            fs: { allow: ['node_modules'] },
            allowedHosts: true,
            proxy: {
                '/api': {
                    target: 'http://uo0s8c4sw488kwg0ko44kg8g.production.bittasker.hedgehackers.finance',
                    changeOrigin: true,
                    secure: false
                }
            }
        },
        resolve: {
            alias: isSsr ? undefined : {
                buffer: 'buffer',
                crypto: 'crypto-browserify',
                stream: 'stream-browserify',
                path: 'path-browserify',
                process: 'process/browser'
            }
        },
        ssr: {
            external: [
                '@breeztech/breez-sdk-liquid',
                '@breeztech/breez-sdk-liquid/web',
                'firebase',
                'swiper',
                'qrcode'
            ]
        },
        worker: {
            format: 'es',
            plugins: () => [wasm(), topLevelAwait()]
        },
    };
});

// test: {
	// 	globals: true,
	// 	environment: 'jsdom',
	// 	setupFiles: ['./vitest-setup-client.ts'],
	// 	coverage: {
	// 		provider: 'v8',
	// 		reporter: ['text', 'json', 'html'],
	// 		exclude: ['node_modules/**']
	// 	},
	// 	deps: {
	// 		optimizer: {
	// 			web: {
	// 				include: ['@storybook/sveltekit']
	// 			}
	// 		}
	// 	},
	// 	workspace: [
	// 		{
	// 			extends: './vite.config.ts',
	// 			plugins: [svelteTesting()],
	// 			test: {
	// 				name: 'client',
	// 				environment: 'jsdom',
	// 				clearMocks: true,
	// 				include: ['src/**/*.{test,spec}.{js,ts}'],
	// 				exclude: ['src/lib/server/**']
	// 			}
	// 		},
	// 		{
	// 			extends: './vite.config.ts',
	// 			test: {
	// 				name: 'server',
	// 				environment: 'node',
	// 				include: ['src/**/*.{test,spec}.{js,ts}'],
	// 				exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
	// 			}
	// 		},
	// 		{
	// 			extends: './vite.config.ts',
	// 			test: {
	// 				name: 'storybook',
	// 				environment: 'jsdom',
	// 				browser: {
	// 					enabled: true,
	// 					headless: true,
	// 					provider: 'playwright',
	// 					name: 'chromium'
	// 				}
	// 			}
	// 		}
	// 	]
// }
