import { chromium, firefox, webkit, type FullConfig, type Browser } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_DIR = path.join(__dirname, '.auth');
const SEED_FILE = path.join(AUTH_DIR, 'test-seed.json');

/**
 * Global setup: seed auth state into each browser engine.
 *
 * Reads the seed file (JWT + nsec/npub/mnemonic) and injects them into
 * each browser's localStorage. The app's nostrKeys.ts checks for
 * __PLAYWRIGHT_TEST__ + __E2E_NSEC__ to bypass passkeys entirely.
 *
 * If no seed file exists, creates empty storage states so Playwright
 * doesn't crash (tests requiring auth will fail with a clear message).
 */

interface SeedData {
	access_token: string;
	refresh_token?: string;
	npub: string;
	nsec: string;
	mnemonic: string;
	[key: string]: string | undefined;
}

function readSeed(): SeedData | null {
	try {
		if (!existsSync(SEED_FILE)) return null;
		return JSON.parse(readFileSync(SEED_FILE, 'utf-8'));
	} catch {
		return null;
	}
}

async function seedBrowser(browser: Browser, name: string, baseURL: string, seed: SeedData) {
	const context = await browser.newContext();
	const page = await context.newPage();

	// Navigate to the app origin so localStorage is scoped correctly
	await page.goto(baseURL);

	// Seed localStorage with everything the app needs.
	// IMPORTANT: Capacitor Preferences prefixes keys with "CapacitorStorage."
	// on web. The layout guard reads Preferences.get({ key: 'access_token' })
	// which resolves to localStorage key 'CapacitorStorage.access_token'.
	const seedData = seed;
	await page.evaluate(function (d) {
		const P = 'CapacitorStorage.';
		if (d.access_token) {
			localStorage.setItem('access_token', d.access_token);
			localStorage.setItem(P + 'access_token', d.access_token);
		}
		if (d.refresh_token) {
			localStorage.setItem('refresh_token', d.refresh_token);
			localStorage.setItem(P + 'refresh_token', d.refresh_token);
		}
		if (d.npub) {
			localStorage.setItem('npub', d.npub);
			localStorage.setItem(P + 'npub', d.npub);
		}
		localStorage.setItem('auth_method', 'nostr');
		localStorage.setItem(P + 'auth_method', 'nostr');
		localStorage.setItem('onboardingCompleted', 'true');
		localStorage.setItem(P + 'onboardingCompleted', 'true');
		if (d.device_id) {
			localStorage.setItem('device_unique_id', d.device_id);
			localStorage.setItem(P + 'device_unique_id', d.device_id);
		}
		if (d.nsec) {
			localStorage.setItem('__E2E_NSEC__', d.nsec);
			localStorage.setItem(P + '__E2E_NSEC__', d.nsec);
		}
		if (d.npub) {
			localStorage.setItem('__E2E_NPUB__', d.npub);
			localStorage.setItem(P + '__E2E_NPUB__', d.npub);
		}
		if (d.mnemonic) {
			localStorage.setItem('__E2E_MNEMONIC__', d.mnemonic);
			localStorage.setItem(P + '__E2E_MNEMONIC__', d.mnemonic);
		}
	}, seedData);

	// Save storage state (cookies + localStorage)
	const storageState = await context.storageState();
	const authFile = path.join(AUTH_DIR, `${name}-auth.json`);
	writeFileSync(authFile, JSON.stringify(storageState, null, 2));
	console.log(`[${name}] Seeded → ${authFile}`);

	await browser.close();
}

async function isPortOpen(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection({ host: '127.0.0.1', port });
		socket.once('connect', () => {
			socket.end();
			resolve(true);
		});
		socket.once('error', () => resolve(false));
	});
}

async function ensureTaskRelay(): Promise<void> {
	const port = Number(process.env.E2E_TASK_RELAY_PORT || 7777);
	if (await isPortOpen(port)) return;

	const relayFile = path.join(__dirname, 'helpers', 'nostr-relay-server.mjs');
	const child = spawn(process.execPath, [relayFile], {
		detached: true,
		stdio: 'ignore',
		env: { ...process.env, E2E_TASK_RELAY_PORT: String(port) }
	});
	child.unref();

	const startedAt = Date.now();
	while (Date.now() - startedAt < 10_000) {
		if (await isPortOpen(port)) {
			console.log(`[global-setup] E2E Nostr relay ready on ws://127.0.0.1:${port}`);
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 150));
	}
	console.warn(`[global-setup] E2E Nostr relay did not open port ${port} in time`);
}

export default async function globalSetup(config: FullConfig) {
	await ensureTaskRelay();
	const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:3000';
	const seed = readSeed();

	if (!seed) {
		console.warn(
			`\n[global-setup] No seed file at ${SEED_FILE}\n` +
				`  Create it manually with your test account data:\n` +
				`  {\n` +
				`    "access_token": "<your-jwt>",\n` +
				`    "refresh_token": "<your-refresh-token>",\n` +
				`    "npub": "<hex-pubkey>",\n` +
				`    "nsec": "<nsec1...>",\n` +
				`    "mnemonic": "<12-word-mnemonic>"\n` +
				`  }\n`
		);
		if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });
		for (const name of ['chromium', 'firefox', 'webkit']) {
			writeFileSync(
				path.join(AUTH_DIR, `${name}-auth.json`),
				JSON.stringify({ cookies: [], origins: [] }, null, 2)
			);
		}
		return;
	}

	await Promise.all([
		seedBrowser(await chromium.launch(), 'chromium', baseURL, seed),
		seedBrowser(await firefox.launch(), 'firefox', baseURL, seed),
		seedBrowser(await webkit.launch(), 'webkit', baseURL, seed)
	]);
}
