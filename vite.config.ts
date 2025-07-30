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

// More info at: https://storybook.js.org/docs/writing-tests/test-addon
export default defineConfig({
	plugins: [
		houdini(), 
		tailwindcss(), 
		sveltekit(), 
		wasm(),
		topLevelAwait(),
		Icons({
			compiler: 'svelte',
			autoInstall: true,
			scale: 1.5,
			defaultStyle: 'width: 1.5em; height: 1.5em;',
			defaultClass: '',
		}),
		visualizer({ open: true, filename: 'bundle-report.html', gzipSize: true, brotliSize: true })
	],
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
		global: 'globalThis'
	},
	resolve: {
		alias: {
			// Add any other aliases here if needed
		}
	},
	build: {
		rollupOptions: {
			output: {
				// Use automatic chunk splitting instead of manual
				manualChunks: undefined,
				// Enable better chunk splitting
				chunkFileNames: 'chunks/[name]-[hash].js',
				entryFileNames: 'entry/[name]-[hash].js',
				assetFileNames: 'assets/[name]-[hash].[ext]'
			}
		},
		chunkSizeWarningLimit: 500, // Lower threshold to catch more issues
		// Enable better tree shaking
		minify: 'terser',
		terserOptions: {
			compress: {
				drop_console: true,
				drop_debugger: true
			}
		}
	},
	optimizeDeps: {
		// Force include heavy dependencies for better optimization
		include: [
			'date-fns',
			'zod',
			'axios',
			'swiper'
		],
		// Exclude the main firebase package to avoid resolution issues with v11
		exclude: [
			'firebase'
		],
		// Force esbuild to handle Firebase v11 modules
		esbuildOptions: {
			// Ensure proper module resolution for Firebase v11
			mainFields: ['module', 'main'],
			resolveExtensions: ['.mjs', '.js', '.ts', '.json']
		}
	},
	server: {
		fs: {
			// Allow serving files from node_modules
			allow: ['node_modules']
		},
		allowedHosts: true,
		proxy: {
			'/api': {
				target: 'http://uo0s8c4sw488kwg0ko44kg8g.production.bittasker.hedgehackers.finance',
				changeOrigin: true,
				secure: false // Allow insecure requests
			}
		}
	},
	optimizeDeps: {
		exclude: ['@breeztech/breez-sdk-liquid/web'],
		include: ['buffer'],
		// Ensure WASM files are handled properly
		esbuildOptions: {
			target: 'es2020'
		}
	},
	build: {
		// Ensure WASM files are copied correctly in production
		assetsInlineLimit: 0,
		rollupOptions: {
			output: {
				// Prevent WASM files from being inlined or mangled
				assetFileNames: (assetInfo) => {
					if (assetInfo.name && assetInfo.name.endsWith('.wasm')) {
						return 'assets/[name].[ext]';
					}
					return 'assets/[name]-[hash].[ext]';
				}
			}
		},
		target: 'es2020'
	},
	// Ensure proper WASM loading in web workers
	worker: {
		format: 'es',
		plugins: () => [wasm(), topLevelAwait()]
	},
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./vitest-setup-client.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: ['node_modules/**']
		},
		deps: {
			optimizer: {
				web: {
					include: ['@storybook/sveltekit']
				}
			}
		},
		workspace: [
			{
				extends: './vite.config.ts',
				plugins: [svelteTesting()],
				test: {
					name: 'client',
					environment: 'jsdom',
					clearMocks: true,
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'storybook',
					environment: 'jsdom',
					browser: {
						enabled: true,
						headless: true,
						provider: 'playwright',
						name: 'chromium'
					}
				}
			}
		]
	}
});
