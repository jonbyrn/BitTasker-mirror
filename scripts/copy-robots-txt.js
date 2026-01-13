#!/usr/bin/env node

/**
 * Copy the appropriate robots.txt file based on VITE_ROBOTS_TXT environment variable
 * - "prod" -> copies robots.txt.prod to robots.txt (allows crawling, references sitemap)
 * - "dev" or undefined -> copies robots.txt.dev to robots.txt (disallows crawling)
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

const robotsMode = process.env.VITE_ROBOTS_TXT || 'dev';
const staticDir = path.join(__dirname, '..', 'static');
const sourceFile = robotsMode === 'prod' 
	? path.join(staticDir, 'robots.txt.prod')
	: path.join(staticDir, 'robots.txt.dev');
const targetFile = path.join(staticDir, 'robots.txt');

try {
	// Check if source file exists
	if (!fs.existsSync(sourceFile)) {
		console.error(`❌ Source robots.txt file not found: ${sourceFile}`);
		process.exit(1);
	}

	// Copy the appropriate file
	fs.copyFileSync(sourceFile, targetFile);
	
	console.log(`✅ Copied robots.txt.${robotsMode} to robots.txt (mode: ${robotsMode})`);
} catch (error) {
	console.error('❌ Error copying robots.txt:', error);
	process.exit(1);
}

