#!/usr/bin/env node

/**
 * Purge Cloudflare cache after deployment.
 * - Requires CLOUDFLARE_CACHE_ZONE_ID and CLOUDFLARE_CACHE_PURGE_TOKEN (e.g. in GitLab CI/CD variables).
 * - Only runs when CI=true (GitLab, Cloudflare Build, etc.); skips for local runs (npm run deploy:workers:dev etc.).
 * - ENVIRONMENT (dev/staging/production) is used for logging only; purge is zone-wide (purge_everything).
 *   If worker.dev, staging, and production share the same zone, one purge clears cached assets for all.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file if it exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
	const envContent = fs.readFileSync(envPath, 'utf-8');
	const envLines = envContent.split('\n');
	for (const line of envLines) {
		const trimmedLine = line.trim();
		// Skip comments and empty lines
		if (!trimmedLine || trimmedLine.startsWith('#')) continue;

		const match = trimmedLine.match(/^([^=]+)=(.*)$/);
		if (match) {
			const key = match[1].trim();
			const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
			// Only set if not already in process.env (environment takes precedence)
			if (!process.env[key]) {
				process.env[key] = value;
			}
		}
	}
}

// Check if running in CI/CD environment
// Cloudflare Workers sets CI=true during builds
if (process.env.CI !== 'true') {
	console.log('⏭️  Skipping cache purge (local build)');
	process.exit(0);
}

const ZONE_ID = process.env.CLOUDFLARE_CACHE_ZONE_ID;
const API_TOKEN = process.env.CLOUDFLARE_CACHE_PURGE_TOKEN;
const ENV = process.env.ENVIRONMENT || 'dev';

if (!ZONE_ID || !API_TOKEN) {
	console.log('⏭️  Skipping cache purge (credentials not set)');
	process.exit(0);
}

console.log(`🔄 Purging cache for ${ENV} environment...`);

try {
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${API_TOKEN}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ purge_everything: true })
		}
	);

	const result = await response.json();

	if (result.success) {
		console.log(`✅ Cache purged successfully for ${ENV} environment`);
	} else {
		console.error(`❌ Cache purge failed:`, result.errors);
		process.exit(1);
	}
} catch (error) {
	console.error(`❌ Error purging cache:`, error.message);
	process.exit(1);
}
