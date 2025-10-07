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
			// Use the conventional name for Cloudflare Pages
			fallback: '404.html',
			// Path to build output
			pages: 'build',
			assets: 'build',
			// Precompress only when explicitly enabled
			precompress: process.env.PRECOMPRESS === '1',
			// Make all paths strict - false allows fallback for dynamic routes
			strict: false
		}),

		prerender: {
			entries: ['*']
		},

        alias: {
            $houdini: ".houdini/"
        }
    }
};

export default config;
