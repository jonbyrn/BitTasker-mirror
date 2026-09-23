import { readFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @param {string} filename @param {number} line */
function lineUsesSvelteReactiveCollection(filename, line) {
	try {
		const sourceLine = readFileSync(filename, 'utf8').split('\n')[line - 1] ?? '';
		return /new\s+Svelte(?:Map|Set)\s*[<(]/.test(sourceLine);
	} catch {
		return false;
	}
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	compilerOptions: {
		runes: true,
		// SvelteMap/SvelteSet are reactive without $state; suppress only those false positives.
		warningFilter: (warning) => {
			if (warning.code !== 'non_reactive_update') return true;
			const filename = warning.filename;
			const line = warning.start?.line;
			if (!filename || line == null) return true;
			return !lineUsesSvelteReactiveCollection(filename, line);
		}
	},

	kit: {
		prerender: { handleHttpError: 'ignore' },
		// Configure the adapter with fallback for SPA navigation
		adapter: adapter({
			// Single-page app mode — index.html serves as the SPA shell for all
			// non-prerendered routes. Cloudflare's single-page-application mode
			// serves this file automatically for any path that has no static asset.
			fallback: 'index.html',
			// Path to build output
			pages: 'build',
			assets: 'build',
			// Precompress only when explicitly enabled
			// Precompress disabled: Cloudflare's edge network handles Brotli/gzip
			// automatically. The adapter-static precompress feature has known bugs
			// (sveltejs/kit#10184, #13031) — .br/.gz files import uncompressed paths.
			precompress: false,
			// Make all paths strict - false allows fallback for dynamic routes
			strict: false
		}),

		paths: {
			// Use absolute paths for assets (critical for SPA on Cloudflare Pages)
			relative: false
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
