import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_DIR = path.join(__dirname, '..', '.auth');
const SEED_FILE = path.join(AUTH_DIR, 'test-seed.json');
const BASE_URL = process.env.PW_E2E_BASE_URL || 'http://localhost:3000';

/**
 * Lightweight seed: launches Chromium, injects localStorage from test-seed.json,
 * saves the storage state. Used by `npm run test:e2e:seed` before manual testing.
 */
async function main() {
	if (!existsSync(SEED_FILE)) {
		console.error(`No seed file at ${SEED_FILE}. Create it with your test account data.`);
		process.exit(1);
	}

	const seed = JSON.parse(readFileSync(SEED_FILE, 'utf-8'));
	if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });

	const browser = await chromium.launch();
	const context = await browser.newContext();
	const page = await context.newPage();

	await page.goto(BASE_URL);

	const seedData = seed;
	await page.evaluate(function(d) {
		const P = 'CapacitorStorage.';
		if (d.access_token) { localStorage.setItem('access_token', d.access_token); localStorage.setItem(P + 'access_token', d.access_token); }
		if (d.refresh_token) { localStorage.setItem('refresh_token', d.refresh_token); localStorage.setItem(P + 'refresh_token', d.refresh_token); }
		if (d.npub) { localStorage.setItem('npub', d.npub); localStorage.setItem(P + 'npub', d.npub); }
		localStorage.setItem('auth_method', 'nostr');
		localStorage.setItem(P + 'auth_method', 'nostr');
		localStorage.setItem('onboardingCompleted', 'true');
		localStorage.setItem(P + 'onboardingCompleted', 'true');
		if (d.device_id) { localStorage.setItem('device_unique_id', d.device_id); localStorage.setItem(P + 'device_unique_id', d.device_id); }
		if (d.nsec) { localStorage.setItem('__E2E_NSEC__', d.nsec); localStorage.setItem(P + '__E2E_NSEC__', d.nsec); }
		if (d.npub) { localStorage.setItem('__E2E_NPUB__', d.npub); localStorage.setItem(P + '__E2E_NPUB__', d.npub); }
		if (d.mnemonic) { localStorage.setItem('__E2E_MNEMONIC__', d.mnemonic); localStorage.setItem(P + '__E2E_MNEMONIC__', d.mnemonic); }
	}, seedData);

	const storageState = await context.storageState();
	const out = path.join(AUTH_DIR, 'chromium-auth.json');
	writeFileSync(out, JSON.stringify(storageState, null, 2));

	const keys = Object.keys(seed).filter((k) => seed[k]);
	console.log(`Seeded chromium → ${out} (${keys.join(', ')})`);

	await browser.close();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
