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
			// Make all paths strict
			strict: true
		}),

        // Service Worker Configuration
        serviceWorker: {
            register: false // We'll register manually to use our static service worker
        },

        alias: {
            $houdini: ".houdini/"
        }
    }
};

export default config;
