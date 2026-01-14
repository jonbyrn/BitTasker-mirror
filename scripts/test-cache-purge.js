#!/usr/bin/env node

/**
 * Test Cloudflare cache purge configuration
 * Validates that CLOUDFLARE_CACHE_ZONE_ID and CLOUDFLARE_CACHE_PURGE_TOKEN are set correctly
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

const ZONE_ID = process.env.CLOUDFLARE_CACHE_ZONE_ID;
const API_TOKEN = process.env.CLOUDFLARE_CACHE_PURGE_TOKEN;

console.log('🧪 Testing Cloudflare Cache Purge Configuration...\n');

// Validate environment variables
if (!ZONE_ID) {
	console.error('❌ Error: CLOUDFLARE_CACHE_ZONE_ID is not set in .env file');
	process.exit(1);
}

if (!API_TOKEN) {
	console.error('❌ Error: CLOUDFLARE_CACHE_PURGE_TOKEN is not set in .env file');
	process.exit(1);
}

console.log('✅ Environment variables found:');
console.log(`   Zone ID: ${ZONE_ID.substring(0, 8)}...`);
console.log(`   API Token: ${API_TOKEN.substring(0, 8)}...\n`);

// Test API connectivity and permissions
console.log('🔍 Testing API connectivity and permissions...');

try {
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`,
		{
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${API_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ 
				purge_everything: true 
			}),
		}
	);

	const result = await response.json();

	if (result.success) {
		console.log('✅ Cache purge API test successful!');
		console.log(`   API Response: Success`);
		console.log(`   Result ID: ${result.result?.id || 'N/A'}`);
		console.log('\n✅ All tests passed! Cache purge script is ready to use.');
		process.exit(0);
	} else {
		console.error('❌ Cache purge API test failed:');
		console.error(`   Errors: ${JSON.stringify(result.errors, null, 2)}`);
		
		// Provide helpful error messages
		if (result.errors && result.errors.length > 0) {
			const firstError = result.errors[0];
			if (firstError.code === 1003) {
				console.error('\n💡 Tip: Check that CLOUDFLARE_CACHE_ZONE_ID is correct');
			} else if (firstError.code === 9109 || firstError.code === 9106) {
				console.error('\n💡 Tip: Check that CLOUDFLARE_CACHE_PURGE_TOKEN has "Zone.Cache Purge Everything" permission');
			}
		}
		
		process.exit(1);
	}
} catch (error) {
	console.error('❌ Error testing cache purge API:');
	console.error(`   ${error.message}`);
	
	if (error.message.includes('fetch failed')) {
		console.error('\n💡 Tip: Check your internet connection');
	} else if (error.message.includes('ECONNREFUSED')) {
		console.error('\n💡 Tip: Check that you can reach api.cloudflare.com');
	}
	
	process.exit(1);
}
