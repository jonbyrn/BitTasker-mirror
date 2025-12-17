#!/usr/bin/env node

/**
 * Generate _routes.json for Cloudflare Pages
 * This file tells Cloudflare Pages which routes to handle with SPA fallback
 * and which ones are static assets that should be served directly.
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const routesConfig = {
	version: 1,
	description: 'Cloudflare Pages routing configuration for SvelteKit SPA',
	include: ['/*'],
	exclude: [
		// SvelteKit internal assets
		'/_app/*',
		'/_app/immutable/*',
		'/_app/version.json',
		
		// Static assets - root level
		'/favicon.ico',
		'/favicon.svg',
		'/favicon-96x96.png',
		'/sitemap.xml',
		'/manifest.json',
		'/site.webmanifest',
		'/apple-touch-icon.png',
		'/web-app-manifest-192x192.png',
		'/web-app-manifest-512x512.png',
		'/firebase-messaging-sw.js',
		
		// Logo files
		'/logo.svg',
		'/logo_compact.svg',
		'/bittasker_logo.webp',
		
		// Static directories
		'/images/*',
		'/icons/*',
		'/illustrations/*',
		'/currency-symbols/*',
		'/locales/*',
		
		// File extensions - images
		'/*.png',
		'/*.jpg',
		'/*.jpeg',
		'/*.gif',
		'/*.svg',
		'/*.ico',
		'/*.webp',
		'/*.avif',
		
		// File extensions - fonts
		'/*.woff',
		'/*.woff2',
		'/*.ttf',
		'/*.eot',
		'/*.otf',
		
		// File extensions - other
		'/*.css',
		'/*.js',
		'/*.mjs',
		'/*.json',
		'/*.txt',
		'/*.xml',
		'/*.pdf',
		'/*.map',
		'/*.wasm',
		
		// Build artifacts
		'/build/*',
		'/.svelte-kit/*'
	]
};

const outputPath = join(__dirname, '..', 'build', '_routes.json');

try {
	writeFileSync(outputPath, JSON.stringify(routesConfig, null, 2));
	console.log('✅ Generated _routes.json for Cloudflare Pages');
	console.log(`📁 Location: ${outputPath}`);
	console.log(`📝 Config: ${routesConfig.exclude.length} exclusion patterns`);
} catch (error) {
	console.error('❌ Failed to generate _routes.json:', error);
	process.exit(1);
}

