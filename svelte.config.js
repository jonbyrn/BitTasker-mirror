import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	compilerOptions: {
		runes: true
	},

	kit: {
		// Configure the adapter with fallback for SPA navigation
		adapter: adapter({
			// Single-page app mode with fallback
			fallback: 'index.html',
			// Path to build output
			pages: 'build',
			assets: 'build',
			// Precompress only when explicitly enabled
			precompress: process.env.PRECOMPRESS === '1',
			// Make all paths strict - false allows fallback for dynamic routes
			strict: false
		}),

		paths: {
			// Use absolute paths for assets (critical for SPA on Cloudflare Pages)
			relative: false
		},

		alias: {
			$houdini: '.houdini/'
		},

		experimental: {
			tracing: {
				server: true
			},

			instrumentation: {
				server: true
			}
		}
	}
};

export default config;
