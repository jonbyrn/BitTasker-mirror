#!/usr/bin/env node
/**
 * Split static/locales/es/dashboard/wallet.json into sub-files by wallet subsystem.
 * Each sub-file: { "wallet": { "section_name": { ... } } }
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'static/locales/es/dashboard';
const WALLET_FILE = join(BASE, 'wallet.json');
const WALLET_DIR = join(BASE, 'wallet');

// Section definitions: [sectionKey, subFileName]
const SECTIONS = [
  ['defi', 'defi.json'],
  ['swap', 'swap.json'],
  ['send', 'send.json'],
  ['receive', 'receive.json'],
  ['buy_sell', 'buysell.json'],
  ['pending_swaps', 'pending-swaps.json'],
  ['common', 'common.json'],
];

// Read and parse
const data = JSON.parse(readFileSync(WALLET_FILE, 'utf8'));
const wallet = data.wallet;

// Count leaf keys
function countLeaves(obj) {
  let count = 0;
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      count += countLeaves(val);
    } else {
      count++;
    }
  }
  return count;
}

const originalCount = countLeaves(wallet);
console.log(`Original leaf keys: ${originalCount}`);

// Create directory
mkdirSync(WALLET_DIR, { recursive: true });

// Extract each section
const extractedKeys = new Set();
let subFileCount = 0;

for (const [key, filename] of SECTIONS) {
  if (wallet[key] === undefined) {
    console.error(`WARNING: key "${key}" not found in wallet.json`);
    continue;
  }
  const wrapper = { wallet: { [key]: wallet[key] } };
  writeFileSync(join(WALLET_DIR, filename), JSON.stringify(wrapper, null, '\t') + '\n');
  extractedKeys.add(key);
  const leaves = countLeaves(wallet[key]);
  subFileCount += leaves;
  console.log(`  ${filename}: ${leaves} leaf keys`);
}

// Rewrite wallet.json with remaining content
const remaining = { wallet: {} };
for (const [key, value] of Object.entries(wallet)) {
  if (!extractedKeys.has(key)) {
    remaining.wallet[key] = value;
  }
}
writeFileSync(WALLET_FILE, JSON.stringify(remaining, null, '\t') + '\n');
const remainingCount = countLeaves(remaining.wallet);

console.log(`\nSub-files total: ${subFileCount}`);
console.log(`Remaining wallet.json: ${remainingCount}`);
console.log(`Reconstructed total: ${subFileCount + remainingCount}`);
console.log(`Match: ${originalCount === subFileCount + remainingCount ? 'PASS ✓' : 'FAIL ✗'}`);

if (originalCount !== subFileCount + remainingCount) {
  process.exit(1);
}
