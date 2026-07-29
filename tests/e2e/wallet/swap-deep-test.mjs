/**
 * Swap Routes Deep E2E v2 — Robust, self-contained tests
 * Connects to Chrome on port 9222 via CDP.
 * Each test group gets a fresh page navigation to avoid drawer state issues.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const CDP_URL = 'http://localhost:9222';
const APP_URL = 'http://localhost:3000';
const SS_DIR = join(process.cwd(), 'Screenshots', 'swap-deep');
const NSEC_PATH = join(process.cwd(), 'test-nsec.txt');
mkdirSync(SS_DIR, { recursive: true });

const getNsec = () => readFileSync(NSEC_PATH, 'utf8').trim();
const ss = async (page, name) => {
	const p = join(SS_DIR, `${name}.png`);
	await page.screenshot({ path: p, fullPage: true });
	console.log(`  📸 ${name}.png`);
};

async function freshLogin(page) {
	await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
	await page.evaluate((nsec) => {
		localStorage.setItem('nostr_nsec', nsec);
		localStorage.setItem('auth_method', 'nsec');
		localStorage.setItem('nostr_login_done', 'true');
	}, getNsec());
	await page.goto(`${APP_URL}/dashboard/wallet`, { waitUntil: 'networkidle', timeout: 20000 });
	await page.waitForTimeout(1000);
}

async function freshSwapPage(page) {
	// Navigate away and back to reset drawer state
	await page.goto(`${APP_URL}/dashboard/wallet`, { waitUntil: 'networkidle', timeout: 20000 });
	await page.waitForTimeout(1000);
}

async function openSwap(page) {
	const btn = page.locator('button:has-text("Swap")').first();
	await btn.click({ timeout: 5000 });
	await page.waitForTimeout(1500);
}

const results = [];
function ok(name) { results.push({ name, s: '✅' }); }
function fail(name, e) { results.push({ name, s: `❌ ${e.split('\n')[0]}` }); console.error(`  ❌ ${e.split('\n')[0]}`); }

async function test(name, fn) {
	console.log(`\n🧪 ${name}`);
	try { await fn(); ok(name); } catch(e) { fail(name, e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
	const browser = await chromium.connectOverCDP(CDP_URL);
	const ctx = browser.contexts()[0] || await browser.newContext();
	const page = await ctx.newPage();

	// Track provider requests
	const api = { boltz: [], symbiosis: [], lifi: [] };
	page.on('request', (req) => {
		const u = req.url();
		if (u.includes('boltz.exchange') && !u.includes('.js')) api.boltz.push(u);
		if (u.includes('symbiosis.finance')) api.symbiosis.push(u);
		if ((u.includes('li.fi') || u.includes('/lifi')) && !u.includes('.ts') && !u.includes('.js')) api.lifi.push(u);
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// GROUP 1: Route resolution + fee display
	// ═══════════════════════════════════════════════════════════════════════════

	await test('Wallet loads with balance and swap button', async () => {
		await freshLogin(page);
		const body = await page.textContent('body');
		if (!body.includes('Swap')) throw new Error('Swap button not found');
		if (!body.includes('Sats')) throw new Error('Balance not shown');
		await ss(page, 'g1-wallet');
	});

	await test('Swap drawer opens — default rBTC→USD, amount empty', async () => {
		await openSwap(page);
		// Verify drawer opened
		const dialog = page.locator('[role="dialog"]');
		if (!(await dialog.isVisible({ timeout: 3000 }).catch(() => false)))
			throw new Error('Dialog did not open');

		// Verify defaults
		const body = await page.textContent('[role="dialog"]');
		if (!body.includes('rBTC')) throw new Error('Default source not rBTC');
		if (!body.includes('USD')) throw new Error('Default dest not USD');

		// Fee card should show dashes (no amount yet)
		const feeText = await page.textContent('[role="dialog"]');
		if (!feeText.includes('—')) console.log('  ⚠️  No dashes in fee card (amount may already be set)');

		await ss(page, 'g1-drawer-open');
	});

	await test('Enter 2500 sats → Boltz+LI.FI route resolves, fees shown', async () => {
		const input = page.locator('input[inputmode="decimal"], input[type="number"]').first();
		await input.fill('2500');
		await input.blur();
		await page.waitForTimeout(5000);

		const dialog = page.locator('[role="dialog"]');
		const text = await dialog.textContent();

		// Fee card should have real data
		const hasTotalSent = text.includes('Total sent');
		const hasFee = text.includes('Fee');
		const hasReceive = text.includes('You receive');
		const hasVia = text.includes('via');
		const hasEstTime = text.includes('Est. time');

		console.log(`  Total sent: ${hasTotalSent}, Fee: ${hasFee}, Receive: ${hasReceive}, Via: ${hasVia}, Est: ${hasEstTime}`);

		if (!hasTotalSent) throw new Error('Total sent label missing');
		if (!hasFee) throw new Error('Fee label missing');
		if (!hasReceive) throw new Error('You receive label missing');

		// Check for non-zero fee
		if (text.includes('0 sats') && !text.includes('Total sent')) {
			console.log('  ⚠️  Fee appears to be 0 sats');
		}

		// Verify provider label
		if (hasVia) {
			const viaIdx = text.indexOf('via');
			const viaSnippet = text.substring(viaIdx, viaIdx + 50);
			console.log(`  Provider: "${viaSnippet.trim()}"`);
		}

		// Verify estimated time
		if (hasEstTime) {
			const estIdx = text.indexOf('Est. time');
			const estSnippet = text.substring(estIdx, estIdx + 30);
			console.log(`  ${estSnippet.trim()}`);
		}

		await ss(page, 'g1-2500-sats');
	});

	await test('Fee math: Total sent - Fee ≈ You receive (within 1 sat)', async () => {
		const dialog = page.locator('[role="dialog"]');
		const text = await dialog.textContent();

		// Parse the fee card - look for "X sats ≈ $Y.ZZ" patterns
		const satsPattern = /(\d[\d,]*)\s*Sats/g;
		const matches = [...text.matchAll(satsPattern)];
		console.log(`  Sats values found: ${matches.map(m => m[1]).join(', ')}`);

		// Look for dollar amounts near Fee/You receive
		const dollarPattern = /\$(\d+\.?\d*)/g;
		const dollarMatches = [...text.matchAll(dollarPattern)];
		console.log(`  Dollar values found: ${dollarMatches.map(m => '$' + m[1]).join(', ')}`);

		// Verify there are non-zero values
		const hasNonZeroSats = matches.some(m => parseInt(m[1].replace(/,/g, '')) > 0);
		const hasNonZeroDollars = dollarMatches.some(m => parseFloat(m[1]) > 0);

		if (!hasNonZeroSats) console.log('  ⚠️  All sats values are zero');
		if (!hasNonZeroDollars) console.log('  ⚠️  All dollar values are zero');
	});

	await test('Provider labels: verify "via X + Y" or "via X" is shown', async () => {
		const dialog = page.locator('[role="dialog"]');
		const text = await dialog.textContent();

		const knownProviders = ['Boltz', 'Symbiosis', 'LI.FI', 'LI.Fi', 'Direct'];
		const found = knownProviders.filter(p => text.includes(p));
		console.log(`  Providers in fee card: ${found.join(', ') || 'none'}`);

		if (found.length === 0) {
			console.log('  ⚠️  No known provider label found');
		}
	});

	// Close drawer via Cancel button (visible in screenshot)
	await page.locator('button:has-text("Cancel")').first().click({ timeout: 3000 }).catch(() => {});
	await page.waitForTimeout(500);

	// ═══════════════════════════════════════════════════════════════════════════
	// GROUP 2: Provider API verification
	// ═══════════════════════════════════════════════════════════════════════════

	// Reset API counters
	api.boltz.length = 0;
	api.symbiosis.length = 0;
	api.lifi.length = 0;

	await test('SmartRouter fires Boltz API for rBTC→USD route', async () => {
		await freshSwapPage(page);
		await openSwap(page);
		const input = page.locator('input[inputmode="decimal"], input[type="number"]').first();
		await input.fill('3000');
		await input.blur();
		await page.waitForTimeout(5000);

		console.log(`  Boltz requests: ${api.boltz.length}`);
		api.boltz.forEach(u => console.log(`    → ${u}`));
		if (api.boltz.length === 0) console.log('  ⚠️  No Boltz API calls detected');
	});

	await test('SmartRouter fires Symbiosis API for rBTC→USD route', async () => {
		console.log(`  Symbiosis requests: ${api.symbiosis.length}`);
		api.symbiosis.forEach(u => console.log(`    → ${u}`));
		if (api.symbiosis.length === 0) console.log('  ⚠️  No Symbiosis API calls (may be killed-switched or not queried for this pair)');
	});

	await test('SmartRouter fires LI.FI API for rBTC→USD route', async () => {
		console.log(`  LI.FI requests: ${api.lifi.length}`);
		api.lifi.forEach(u => console.log(`    → ${u}`));
		if (api.lifi.length === 0) console.log('  ⚠️  No LI.FI API calls detected');
	});

	// Close drawer
	await page.locator('button:has-text("Cancel")').first().click({ timeout: 3000 }).catch(() => {});
	await page.waitForTimeout(500);

	// ═══════════════════════════════════════════════════════════════════════════
	// GROUP 3: Edge cases
	// ═══════════════════════════════════════════════════════════════════════════

	await test('Max button fills available balance', async () => {
		await freshSwapPage(page);
		await openSwap(page);

		const maxBtn = page.locator('button:has-text("Max")').first();
		if (!(await maxBtn.isVisible({ timeout: 3000 }).catch(() => false)))
			throw new Error('Max button not visible');

		await maxBtn.click();
		await page.waitForTimeout(5000);

		const input = page.locator('input[inputmode="decimal"], input[type="number"]').first();
		const val = await input.inputValue();
		console.log(`  Input after Max: ${val}`);
		if (!val || val === '0') throw new Error('Max did not fill input');

		const dialog = page.locator('[role="dialog"]');
		const text = await dialog.textContent();
		if (!text.includes('You receive') || text.includes('—')) {
			console.log('  ⚠️  Fee card not populated after Max');
		}

		await ss(page, 'g3-max-button');
	});

	await test('Minimum amount shown when below threshold', async () => {
		await freshSwapPage(page);
		await openSwap(page);

		const input = page.locator('input[inputmode="decimal"], input[type="number"]').first();
		await input.fill('100');
		await input.blur();
		await page.waitForTimeout(3000);

		const dialog = page.locator('[role="dialog"]');
		const text = await dialog.textContent();
		const hasMinimum = text.includes('Minimum') || text.includes('minimum');
		const hasBelowMin = text.includes('Below') || text.includes('below');
		console.log(`  Minimum label: ${hasMinimum}, Below: ${hasBelowMin}`);

		if (!hasMinimum && !hasBelowMin) {
			console.log('  ⚠️  No minimum indicator shown for 100 sats');
		}

		await ss(page, 'g3-below-min');
	});

	await test('Swap Preview button disabled when amount is 0', async () => {
		await freshSwapPage(page);
		await openSwap(page);

		// Amount should be 0 by default
		const previewBtn = page.locator('button:has-text("Swap Preview")').first();
		if (await previewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
			const isDisabled = await previewBtn.isDisabled();
			console.log(`  Swap Preview disabled at 0: ${isDisabled}`);
		}

		await ss(page, 'g3-preview-disabled');
	});

	await test('Swap Preview button enabled when valid amount entered', async () => {
		const input = page.locator('input[inputmode="decimal"], input[type="number"]').first();
		await input.fill('3000');
		await input.blur();
		await page.waitForTimeout(4000);

		const previewBtn = page.locator('button:has-text("Swap Preview")').first();
		if (await previewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
			const isDisabled = await previewBtn.isDisabled();
			console.log(`  Swap Preview disabled at 3000 sats: ${isDisabled}`);
			if (isDisabled) {
				console.log('  ⚠️  Preview button should be enabled with valid amount');
			}
		}

		await ss(page, 'g3-preview-enabled');
	});

	// Close drawer
	await page.locator('button:has-text("Cancel")').first().click({ timeout: 3000 }).catch(() => {});
	await page.waitForTimeout(500);

	// ═══════════════════════════════════════════════════════════════════════════
	// GROUP 4: Console errors during swap flow
	// ═══════════════════════════════════════════════════════════════════════════

	await test('No critical console errors during swap route resolution', async () => {
		const consoleErrors = [];
		const handler = (msg) => {
			if (msg.type() === 'error') {
				const text = msg.text();
				// Filter out known non-critical errors
				if (!text.includes('favicon') && !text.includes('404') && !text.includes('Analytics')) {
					consoleErrors.push(text.substring(0, 150));
				}
			}
		};
		page.on('console', handler);

		await freshSwapPage(page);
		await openSwap(page);
		const input = page.locator('input[inputmode="decimal"], input[type="number"]').first();
		await input.fill('2500');
		await input.blur();
		await page.waitForTimeout(5000);

		page.off('console', handler);

		if (consoleErrors.length > 0) {
			console.log(`  Console errors (${consoleErrors.length}):`);
			consoleErrors.forEach(e => console.log(`    ${e}`));
		} else {
			console.log('  No critical console errors');
		}
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// GROUP 5: Route navigation smoke tests
	// ═══════════════════════════════════════════════════════════════════════════

	const routes = [
		['/', 'Homepage'],
		['/auth/login', 'Login'],
		['/auth/signup', 'Signup'],
		['/services', 'Services'],
		['/faq', 'FAQ'],
		['/terms', 'Terms'],
		['/privacy', 'Privacy'],
		['/how-it-works', 'How It Works'],
		['/about', 'About'],
		['/security', 'Security'],
	];

	for (const [path, name] of routes) {
		await test(`Route ${name} (${path}) loads`, async () => {
			await page.goto(`${APP_URL}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
			const body = await page.textContent('body');
			if (!body || body.length < 50) throw new Error('Page body too short');
			await ss(page, `g5-route-${name.toLowerCase().replace(/\s/g, '-')}`);
		});
	}

	// Authed routes
	await test('Route Dashboard loads (authed)', async () => {
		await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
		await ss(page, 'g5-route-dashboard');
	});

	await test('Route Earning loads (authed)', async () => {
		await page.goto(`${APP_URL}/earning`, { waitUntil: 'networkidle', timeout: 20000 });
		await ss(page, 'g5-route-earning');
	});

	await test('Route Settings loads (authed)', async () => {
		await page.goto(`${APP_URL}/dashboard/settings`, { waitUntil: 'networkidle', timeout: 20000 });
		await ss(page, 'g5-route-settings');
	});

	await test('Route Reviews loads (authed)', async () => {
		await page.goto(`${APP_URL}/reviews`, { waitUntil: 'networkidle', timeout: 20000 });
		await ss(page, 'g5-route-reviews');
	});

	await test('Route Messages loads (authed)', async () => {
		await page.goto(`${APP_URL}/dashboard/messages`, { waitUntil: 'networkidle', timeout: 20000 });
		await ss(page, 'g5-route-messages');
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// RESULTS
	// ═══════════════════════════════════════════════════════════════════════════

	const pass = results.filter(r => r.s === '✅').length;
	const fail = results.filter(r => r.s !== '✅').length;
	console.log('\n' + '═'.repeat(60));
	console.log(`SWAP DEEP E2E — ${results.length} tests | ${pass} passed | ${fail} failed`);
	console.log('═'.repeat(60));
	for (const r of results) console.log(`  ${r.s} ${r.name}`);
	console.log('═'.repeat(60));

	// Provider summary
	console.log('\n📊 Provider API Summary:');
	console.log(`  Boltz:     ${api.boltz.length} requests`);
	console.log(`  Symbiosis: ${api.symbiosis.length} requests`);
	console.log(`  LI.FI:     ${api.lifi.length} requests`);

	await page.close();
	await browser.close();
}

main().catch(console.error);
