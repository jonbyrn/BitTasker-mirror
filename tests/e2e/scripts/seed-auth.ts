import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_DIR = path.join(__dirname, '.auth');
const SEED_FILE = path.join(AUTH_DIR, 'test-seed.json');
const BASE_URL = process.env.PW_E2E_BASE_URL || 'http://localhost:3000';
const API_URL = process.env.VITE_API_URL || BASE_URL;

/**
 * Seed script for cross-browser E2E tests.
 *
 * Performs a complete nsec login via the browser (with passkey bypass),
 * captures ALL auth data the app needs, and saves it to
 * tests/e2e/.auth/test-seed.json.
 *
 * PREREQUISITE: The test nsec must have a registered account on the API.
 * If the account doesn't exist, register it first:
 *   1. Start dev server: npm run dev
 *   2. Open http://localhost:3000/auth/register in a browser
 *   3. Register with the test nsec
 *   4. Then run this script
 *
 * Or use the API directly:
 *   curl -X POST $API_URL/api/v1/auth/register \
 *     -H "Content-Type: application/json" \
 *     -d '{"username":"test-e2e","npub":"<hex-pubkey>",...}'
 *
 * Usage:
 *   npx tsx tests/e2e/scripts/seed-auth.ts
 *
 * The seed file is gitignored and must be regenerated when JWT expires.
 */

interface SeedData {
	access_token: string | null;
	refresh_token: string | null;
	npub: string | null;
	auth_method: string | null;
	webAuthnCredentialId: string | null;
	onboardingCompleted: string | null;
	nsec: string;
	seededAt: string;
}

async function seedAuth() {
	if (!existsSync(AUTH_DIR)) {
		mkdirSync(AUTH_DIR, { recursive: true });
	}

	const NSEC =
		process.env.TEST_NOSTR_NSEC ||
		'nsec1ljqmrqvkjjgd46yzd66nzpzgznghyfpcvs4nxk6j5jg2mxvs7r8qjyefh3';

	console.log('=== BitTasker E2E Auth Seed ===\n');
	console.log('API URL:', API_URL);
	console.log('Base URL:', BASE_URL);
	console.log('');

	// Step 1: Try API-only login first (no browser needed)
	console.log('Attempting API-only login...');
	const apiSeed = await tryApiLogin(NSEC);
	if (apiSeed) {
		saveSeed(apiSeed);
		return;
	}

	// Step 2: Fall back to browser-based login
	console.log('API-only login failed. Trying browser-based login...\n');
	await browserLogin(NSEC);
}

/**
 * Try to authenticate via API calls only (no browser).
 * This is faster and works headless.
 */
async function tryApiLogin(): Promise<SeedData | null> {
	try {
		// 1. Get challenge
		const challengeRes = await fetch(`${API_URL}/api/v1/auth/challenge`);
		if (!challengeRes.ok) {
			console.log('  Challenge endpoint returned:', challengeRes.status);
			return null;
		}
		const { challenge } = (await challengeRes.json()) as { challenge: string; message: string };
		console.log('  Got challenge:', challenge.slice(0, 20) + '...');

		// 2. We need to sign a Nostr event — this requires nostr-tools
		// For now, fall back to browser login which handles signing natively
		console.log('  (Event signing requires browser — falling back)');
		return null;
	} catch (error) {
		console.log('  API login error:', (error as Error).message);
		return null;
	}
}

/**
 * Browser-based login with passkey bypass.
 */
async function browserLogin(nsec: string) {
	console.log('Launching browser...');
	const browser = await chromium.launch({ headless: false });
	const context = await browser.newContext();
	const page = await context.newPage();

	// CRITICAL: Inject __PLAYWRIGHT_TEST__ BEFORE any page loads
	await page.addInitScript(() => {
		window.__PLAYWRIGHT_TEST__ = true;
	});

	// Capture console for debugging
	page.on('console', (msg) => {
		if (msg.type() === 'error') {
			console.log('  [page error]', msg.text());
		}
	});

	page.on('response', (response) => {
		const url = response.url();
		if (url.includes('/api/v1/auth/')) {
			console.log(`  [api] ${response.status()} ${url.split('/api/')[1]}`);
		}
	});

	try {
		await page.goto(`${BASE_URL}/auth/login`);
		console.log('Login page loaded. Waiting for UI...');
		await page.waitForLoadState('domcontentloaded');

		// Wait a bit for Svelte hydration
		await page.waitForTimeout(2000);

		// Debug: show what's on the page
		const pageTitle = await page.title();
		const pageUrl = page.url();
		console.log(`  Page: ${pageTitle} (${pageUrl})`);

		// Check what buttons are visible
		const allButtons = await page.locator('button').allTextContents();
		console.log(
			'  Buttons found:',
			allButtons
				.slice(0, 5)
				.map((t) => t.trim())
				.filter(Boolean)
		);

		// Try nsec login
		const nsecButton = page.locator('[data-testid="login-with-nsec"]');
		const nsecVisible = await nsecButton.isVisible({ timeout: 10_000 }).catch(() => false);
		console.log('  login-with-nsec visible:', nsecVisible);

		if (nsecVisible) {
			await nsecButton.click();
			console.log('  Clicked "Login with nsec"');
			await page.waitForTimeout(500);
		}

		const nsecInput = page.locator('[data-testid="login-nsec-input"]');
		const inputVisible = await nsecInput.isVisible({ timeout: 5_000 }).catch(() => false);
		console.log('  login-nsec-input visible:', inputVisible);

		if (inputVisible) {
			await nsecInput.fill(nsec);
			console.log('  Filled nsec input');
		} else {
			// Try alternative selectors
			const altInput = page
				.locator('input[placeholder*="nsec"], textarea[placeholder*="nsec"]')
				.first();
			const altVisible = await altInput.isVisible({ timeout: 3000 }).catch(() => false);
			if (altVisible) {
				await altInput.fill(nsec);
				console.log('  Filled nsec input (alt selector)');
			} else {
				// Take screenshot for debugging
				await page.screenshot({ path: path.join(AUTH_DIR, 'debug-login-page.png') });
				console.log('  Screenshot saved to tests/e2e/.auth/debug-login-page.png');
				throw new Error('Could not find nsec input field');
			}
		}

		const submitButton = page.locator('[data-testid="login-submit"]');
		const submitVisible = await submitButton.isVisible({ timeout: 5_000 }).catch(() => false);
		console.log('  login-submit visible:', submitVisible);

		if (submitVisible) {
			await submitButton.click();
		} else {
			// Try generic submit
			await page.locator('button[type="submit"]').first().click();
		}
		console.log('  Submitted login form\n');

		// Wait for redirect or error
		console.log('Waiting for authentication (30s timeout)...');
		await page.waitForURL(/.*\/(dashboard|auth\/onboarding)/, { timeout: 30_000 });
		console.log('Authenticated! URL:', page.url());

		// Capture localStorage
		const authData = await page.evaluate(() => {
			const keys = [
				'access_token',
				'refresh_token',
				'npub',
				'auth_method',
				'webAuthnCredentialId',
				'onboardingCompleted'
			];
			const data: Record<string, string | null> = {};
			for (const key of keys) {
				data[key] = localStorage.getItem(key);
			}
			return data;
		});

		const seedData: SeedData = {
			...authData,
			nsec,
			seededAt: new Date().toISOString()
		};

		saveSeed(seedData);

		// Also save browser storage state
		const storageState = await context.storageState();
		writeFileSync(path.join(AUTH_DIR, 'chromium-auth.json'), JSON.stringify(storageState, null, 2));
		console.log('Browser state saved to tests/e2e/.auth/chromium-auth.json');
	} catch (error) {
		console.error('\n=== SEED FAILED ===');
		console.error((error as Error).message);
		console.error('\nTroubleshooting:');
		console.error('  1. Is the dev server running? (npm run dev)');
		console.error('  2. Is the test nsec registered? (sign up at /auth/register)');
		console.error('  3. Is the API reachable? (check VITE_API_URL)');
		process.exit(1);
	} finally {
		await browser.close();
	}
}

function saveSeed(data: SeedData) {
	if (!existsSync(AUTH_DIR)) {
		mkdirSync(AUTH_DIR, { recursive: true });
	}
	writeFileSync(SEED_FILE, JSON.stringify(data, null, 2));
	console.log('\nSeed saved to:', SEED_FILE);
	console.log(
		'Keys:',
		Object.keys(data).filter((k) => data[k as keyof SeedData])
	);
}

seedAuth();
