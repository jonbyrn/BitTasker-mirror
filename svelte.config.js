import adapter from '@sveltejs/adapter-cloudflare';
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
        // Configure the adapter for Cloudflare Workers
        adapter: adapter({
			// Routes configuration for Cloudflare Workers
			routes: {
				// Include all routes except API routes handled by server functions
				include: ['/*'],
				// Exclude patterns that should be handled by static assets
				exclude: [
					'/robots.txt',
					'/sitemap.xml',
					'/favicon.ico',
					'/manifest.json',
					'/_app/immutable/assets/*'
				]
			},
			// Platform configuration for Workers runtime
			platformProxy: {
				// Enable environment variables and bindings
				environment: undefined,
				experimentalJsonConfig: false,
				configPath: 'wrangler.toml',
				persist: false
			}
		}),

        alias: {
            $houdini: ".houdini/"
        }
    }
};

export default config;
