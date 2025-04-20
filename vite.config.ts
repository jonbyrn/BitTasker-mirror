import fs from 'fs';
import path from 'path';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const CERT_PATH = path.resolve(__dirname, 'cert');

// More info at: https://storybook.js.org/docs/writing-tests/test-addon
export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		allowedHosts: true,
		proxy: {
			'/api': {
				target: 'http://uo0s8c4sw488kwg0ko44kg8g.production.bittasker.hedgehackers.finance',
				changeOrigin: true,
				secure: false // Allow insecure requests
			}
		},
		https: {
			key: fs.readFileSync(path.join(CERT_PATH, 'localhost-key.pem')),
			cert: fs.readFileSync(path.join(CERT_PATH, 'localhost.pem'))
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
						provider: 'playwright'
					}
				}
			}
		]
	}
});
