#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const domain = 'https://bittasker.com';
const buildDir = 'build';

// Determine if this is a production build
// Check in order: command-line argument, DEPLOY_ENV, NODE_ENV
const args = process.argv.slice(2);
const isProductionArg = args.includes('--production') || args.includes('-p');
const deployEnv = process.env.DEPLOY_ENV || process.env.NODE_ENV;
const isProduction = isProductionArg || deployEnv === 'production';

// Ensure build directory exists
if (!fs.existsSync(buildDir)) {
	fs.mkdirSync(buildDir, { recursive: true });
}

let robotsContent;

if (isProduction) {
	// Production: Allow bots and include sitemap
	robotsContent = `User-agent: *
Allow: /

# Disallow private/protected routes
Disallow: /dashboard/
Disallow: /auth/onboarding

# Sitemap
Sitemap: ${domain}/sitemap.xml
`;
} else {
	// Non-production (staging, dev, etc.): Block all bots
	robotsContent = `User-agent: *
Disallow: /
`;
}

// Write to build directory
const outputPath = path.join(__dirname, '..', buildDir, 'robots.txt');
fs.writeFileSync(outputPath, robotsContent);

console.log(`✅ robots.txt generated successfully!`);
console.log(`📁 Generated file: ${buildDir}/robots.txt`);
console.log(`🌍 Environment: ${isProduction ? 'PRODUCTION' : 'NON-PRODUCTION'}`);
console.log(`🤖 Bot access: ${isProduction ? 'ALLOWED' : 'BLOCKED'}`);
if (isProduction) {
	console.log(`🗺️  Sitemap: ${domain}/sitemap.xml`);
}

