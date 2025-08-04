import houdini from 'houdini/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import Icons from 'unplugin-icons/vite';
import pkg from './package.json';

// More info at: https://storybook.js.org/docs/writing-tests/test-addon
export default defineConfig({
	plugins: [
		houdini(), 
		tailwindcss(), 
		sveltekit(), 
		Icons({
			compiler: 'svelte',
			autoInstall: true,
			scale: 1.2,
			defaultStyle: '',
			defaultClass: '',
		}),
		visualizer({ open: true, filename: 'bundle-report.html', gzipSize: true, brotliSize: true })
	],
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version)
	},
	resolve: {
		alias: {
			// Firebase v11 specific aliases
			'firebase/app': 'firebase/app',
			'firebase/messaging': 'firebase/messaging',
			'firebase/auth': 'firebase/auth',
			'firebase/firestore': 'firebase/firestore',
			'firebase/storage': 'firebase/storage',
			'firebase/analytics': 'firebase/analytics'
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
			'firebase/app',
			'firebase/messaging',
			'firebase/auth',
			'firebase/firestore',
			'firebase/storage',
			'firebase/analytics',
			'date-fns',
			'zod',
			'axios',
			'swiper',
			'iconify-icon'
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
