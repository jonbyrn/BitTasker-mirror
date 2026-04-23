#!/usr/bin/env node

/**
 * Test script to verify service URL slug generation from Nostr data
 * Usage: node scripts/test-service-url-slug.mjs [npub]
 *
 * Example:
 *   node scripts/test-service-url-slug.mjs npub1lvyv55t0uxvhlg8gxsxvmvd2ejhswf6d9xxfkvx6s3s3vgr6d7uas5qdpq
 */

import { readFileSync } from 'fs';
import https from 'https';
import http from 'http';

const DEFAULT_NPUB = 'npub1lvyv55t0uxvhlg8gxsxvmvd2ejhswf6d9xxfkvx6s3s3vgr6d7uas5qdpq';

const args = process.argv.slice(2);
const inputNpub = args[0] || DEFAULT_NPUB;

console.log('\n🔍 Testing Service URL Slug Generation from Nostr Data');
console.log(`   Input: ${inputNpub}\n`);

function getEnv(key, fallback = '') {
  try {
    const envContent = readFileSync('.env', 'utf-8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed.startsWith(key + '=')) {
        const value = trimmed.slice(key.length + 1).trim();
        return value.replace(/^["']|["']$/g, '').split('#')[0].trim();
      }
    }
  } catch {}
  return fallback;
}

function getHttp() {
  return getEnv('VITE_API_URL', '').startsWith('https') ? https : http;
}

function generateSlug(text) {
  if (!text) return null;
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 50);
}

function getNpubSuffix(npub) {
  return npub.replace(/[^a-z0-9]/gi, '').slice(0, 6);
}

async function fetchNip05(identifier) {
  return new Promise((resolve, reject) => {
    const httpModule = getHttp();
    const url = new URL(getEnv('VITE_API_URL', 'https://api-dev.bittasker.com'));
    
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `/.well-known/nostr.json?name=${encodeURIComponent(identifier)}`,
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    };

    const req = httpModule.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.end();
  });
}

async function main() {
  const apiUrl = getEnv('VITE_API_URL', 'https://api-dev.bittasker.com');
  console.log(`📡 Using API: ${apiUrl}\n`);

  // Show npub suffix
  const npubSuffix = getNpubSuffix(inputNpub);
  console.log('📋 Input Data:');
  console.log(`   npub: ${inputNpub}`);
  console.log(`   npub suffix (6 chars): ${npubSuffix}\n`);

  // Test NIP-05 lookup (most common pattern)
  console.log('📡 Testing NIP-05 lookup patterns...');
  
  const testIdentifiers = [
    `${npubSuffix.slice(0, 4)}@bitcoinplug.de`,
    `${npubSuffix.slice(0, 4)}@stacker.news`,
    `${npubSuffix.slice(0, 4)}@ nostr.band`
  ];
  
  let profile = null;
  let foundNip05 = null;
  
  for (const identifier of testIdentifiers) {
    try {
      console.log(`   Testing: ${identifier}`);
      const result = await fetchNip05(identifier);
      if (result && result.names && Object.keys(result.names).length > 0) {
        const names = result.names;
        const pubkey = names[Object.keys(names)[0]];
        if (pubkey) {
          console.log(`   ✅ Found! Pubkey: ${pubkey.slice(0, 16)}...`);
          profile = { pubkey, nip05: identifier };
          foundNip05 = identifier.split('@')[0];
          break;
        }
      }
    } catch (err) {
      console.log(`   ⚠️  ${err.message}`);
    }
  }

  if (profile) {
    console.log('\n📋 Profile Data Found:');
    console.log(`   nip05: ${foundNip05}\n`);
  } else {
    console.log('⚠️  No NIP-05 profile found - using npub-derived fallback\n');
  }

  // Generate URL slugs
  console.log('📋 Generated URL Options:');

  // Option 1: Username from NIP-05
  if (foundNip05) {
    const usernameSlug = generateSlug(foundNip05);
    console.log(`   Username-based: /services/${usernameSlug} (from NIP-05)`);
  } else {
    console.log(`   Username-based: (no username found)`);
  }

  // Option 2: Npub-derived username
  const npubSlug = npubSuffix;
  console.log(`   Npub-derived: /services/${npubSlug}`);

  // With service title examples
  const testTitles = ['Logo Design', 'Web Development', 'Photography'];
  console.log('\n📋 Example Service URLs:');

  for (const title of testTitles) {
    const slug = generateSlug(title);
    if (foundNip05) {
      const usernameSlug = generateSlug(foundNip05);
      console.log(`   "${title}" -> /services/${usernameSlug}/${slug}`);
    }
    console.log(`   "${title}" -> /services/${slug}-${npubSuffix}`);
  }

  console.log('\n✅ Test complete!\n');
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});