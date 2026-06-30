/**
 * Swap Remaining Pairs — Test via CDP (localhost:9222)
 *
 * Tests the 3 remaining swap pairs after Symbiosis was disabled:
 *   1. USDT0 → RBTC  (LI.FI hop1 + Boltz hop2)
 *   2. WBTC → RBTC   (Uniswap V3 hop1 + Boltz hop2)
 *   3. WBTC → USDT0  (direct Uniswap V3)
 *
 * Run: node tests/e2e/wallet/swap-remaining-pairs.cjs
 */
const { chromium } = require('playwright');

const CDP_URL = 'http://localhost:9222';
const WALLET_URL = 'http://localhost:3000/wallet';

async function main() {
	console.log('Connecting to Chrome via CDP');
	const browser = await chromium.connectOverCDP(CDP_URL);
	const ctx = browser.contexts()[0];
	const page = ctx.pages()[0] || await ctx.newPage();

	// Navigate to wallet
	console.log('Navigating to wallet...');
	await page.goto(WALLET_URL, { waitUntil: 'networkidle', timeout: 30000 });
	await page.waitForTimeout(3000);

	// Open swap form
	console.log('Opening swap form...');
	await page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll('button'));
		const swapBtn = btns.find(b => b.textContent.trim() === 'Swap');
		if (swapBtn) swapBtn.click();
	});
	await page.waitForTimeout(2000);

	// Verify swap form is open
	const hasPreview = await page.evaluate(() =>
		Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Swap Preview'))
	);
	console.log('Swap form open:', hasPreview);
	if (!hasPreview) {
		console.log('ABORT: swap form not open');
		await browser.close();
		process.exit(1);
	}

	// ─── Test 1: USDT0 → RBTC ───
	await testPair(page, {
		source: 'USDT0', dest: 'RBTC', amount: '1',
		label: 'usdt0-to-rbtc', desc: 'LI.FI hop1 + Boltz hop2'
	});

	// ─── Test 2: WBTC → RBTC ───
	await testPair(page, {
		source: 'wBTC', dest: 'RBTC', amount: '0.0001',
		label: 'wbtc-to-rbtc', desc: 'Uniswap V3 hop1 + Boltz hop2'
	});

	// ─── Test 3: WBTC → USDT0 ───
	await testPair(page, {
		source: 'wBTC', dest: 'USDT0', amount: '0.0001',
		label: 'wbtc-to-usdt0', desc: 'Direct Uniswap V3'
	});

	// ─── Control: rBTC → USDT0 ───
	await testPair(page, {
		source: 'rBTC', dest: 'USDT0', amount: '0.0001',
		label: 'rbtc-to-usdt0', desc: 'Boltz + LI.FI 2-hop (control)'
	});

	await browser.close();
	console.log('\n=== All tests complete ===');
}

async function testPair(page, { source, dest, amount, label, desc }) {
	console.log(`\n=== ${source} → ${dest} (${desc}) ===`);

	// Step 1: Click source asset selector (the span containing the asset name near y=344)
	const sourceResult = await page.evaluate((asset) => {
		// Find the source asset span — it's in the "Send" section of the swap form
		const spans = Array.from(document.querySelectorAll('span'));
		// Look for spans that contain the asset name and are in the form area
		const assetSpan = spans.find(s => {
			const r = s.getBoundingClientRect();
			const text = s.textContent.trim();
			return r.y > 330 && r.y < 360 && r.height > 0 &&
				(text.includes(asset) || text.includes('Bitcoin') || text.includes('USD'));
		});
		if (!assetSpan) return 'no-span-found';

		// Click the parent button or the span itself
		const btn = assetSpan.closest('button') || assetSpan;
		btn.click();
		return 'clicked: ' + assetSpan.textContent.trim().substring(0, 50);
	}, source);
	console.log('  Source click:', sourceResult);
	await page.waitForTimeout(1000);

	// Step 2: Select source asset from dropdown
	const sourceSelected = await page.evaluate((asset) => {
		// After clicking, a dropdown appears with asset options
		const items = Array.from(document.querySelectorAll('button, li, [role=option], a'));
		const match = items.find(el => {
			const text = el.textContent.toUpperCase();
			const r = el.getBoundingClientRect();
			// Must be visible and match asset
			if (r.height === 0) return false;
			if (asset === 'USDT0') return text.includes('USDT0') && !text.includes('BINANCE');
			if (asset === 'wBTC' || asset === 'WBTC') return text.includes('WBTC') || text.includes('(WBTC)');
			if (asset === 'rBTC' || asset === 'RBTC') return (text.includes('RBTC') || text.includes('(RBTC)')) && !text.includes('WBTC') && !text.includes('TBTC');
			if (asset === 'tBTC' || asset === 'TBTC') return text.includes('TBTC') || text.includes('(TBTC)');
			return text.includes(asset.toUpperCase());
		});
		if (match) {
			match.click();
			return 'selected: ' + match.textContent.trim().substring(0, 60);
		}
		return 'not-found: ' + asset;
	}, source);
	console.log('  Source select:', sourceSelected);
	await page.waitForTimeout(500);

	// Step 3: Click dest asset selector (span near y=386)
	const destResult = await page.evaluate((asset) => {
		const spans = Array.from(document.querySelectorAll('span'));
		// Dest asset span is in the "Receive" section, below the amount input
		const assetSpan = spans.find(s => {
			const r = s.getBoundingClientRect();
			const text = s.textContent.trim();
			return r.y > 370 && r.y < 400 && r.height > 0 &&
				(text.includes('Bitcoin') || text.includes('USD') || text.includes(asset));
		});
		if (!assetSpan) return 'no-span-found';

		const btn = assetSpan.closest('button') || assetSpan;
		btn.click();
		return 'clicked: ' + assetSpan.textContent.trim().substring(0, 50);
	}, dest);
	console.log('  Dest click:', destResult);
	await page.waitForTimeout(1000);

	// Step 4: Select dest asset from dropdown
	const destSelected = await page.evaluate((asset) => {
		const items = Array.from(document.querySelectorAll('button, li, [role=option], a'));
		const match = items.find(el => {
			const text = el.textContent.toUpperCase();
			const r = el.getBoundingClientRect();
			if (r.height === 0) return false;
			if (asset === 'USDT0') return text.includes('USDT0') && !text.includes('BINANCE');
			if (asset === 'wBTC' || asset === 'WBTC') return text.includes('WBTC') || text.includes('(WBTC)');
			if (asset === 'rBTC' || asset === 'RBTC') return (text.includes('RBTC') || text.includes('(RBTC)')) && !text.includes('WBTC') && !text.includes('TBTC');
			if (asset === 'tBTC' || asset === 'TBTC') return text.includes('TBTC') || text.includes('(TBTC)');
			return text.includes(asset.toUpperCase());
		});
		if (match) {
			match.click();
			return 'selected: ' + match.textContent.trim().substring(0, 60);
		}
		return 'not-found: ' + asset;
	}, dest);
	console.log('  Dest select:', destSelected);
	await page.waitForTimeout(500);

	// Step 5: Enter amount
	const amountOk = await page.evaluate((amt) => {
		const input = document.querySelector('input[type="number"], input[inputmode="decimal"]');
		if (!input) return false;
		const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
		nativeSetter.call(input, amt);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
		input.dispatchEvent(new Event('blur', { bubbles: true }));
		return true;
	}, amount);
	console.log('  Amount entered:', amountOk);

	// Step 6: Wait for route resolution
	console.log('  Waiting 8s for route resolution...');
	await page.waitForTimeout(8000);

	// Step 7: Analyze results
	const result = await page.evaluate(() => {
		const body = document.body.innerText;
		return {
			hasFee: /[Ff]ee/.test(body),
			hasReceive: /[Rr]eceive/.test(body),
			hasBoltz: /[Bb]oltz/.test(body),
			hasLifi: /LI\.FI|lifi/.test(body),
			hasUniswap: /[Uu]niswap/.test(body),
			hasError: /error|Error|failed|minimum|insufficient/i.test(body),
			routeText: (body.match(/(?:via|Route)[:\s]*([^\n]{3,80})/i) || [])[1] || null,
			feeText: (body.match(/[Ff]ee[:\s]*\$?[\d.]+%?/) || [])[0] || null,
			receiveText: (body.match(/[Rr]eceive[:\s]*[\d,.]+\s*\w*/) || [])[0] || null,
			previewEnabled: (() => {
				const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Preview'));
				return btn ? !btn.disabled : false;
			})(),
			errorText: (() => {
				if (!/error|Error|failed|minimum|insufficient/i.test(body)) return null;
				const lines = body.split('\\n');
				return lines.find(l => /error|failed|minimum|insufficient/i.test(l))?.trim().substring(0, 100) || null;
			})()
		};
	});

	// Log results
	console.log(`  Fee: ${result.hasFee} (${result.feeText || 'none'})`);
	console.log(`  Receive: ${result.hasReceive} (${result.receiveText || 'none'})`);
	console.log(`  Route: ${result.routeText || 'none'}`);
	console.log(`  Providers: boltz=${result.hasBoltz} lifi=${result.hasLifi} uniswap=${result.hasUniswap}`);
	console.log(`  Preview enabled: ${result.previewEnabled}`);
	console.log(`  Error: ${result.hasError} ${result.errorText || ''}`);

	await page.screenshot({ path: `Screenshots/swap-remaining-${label}.png` });

	const passed = result.previewEnabled || (result.hasFee && result.hasReceive && !result.hasError);
	console.log(`  STATUS: ${passed ? 'PASS ✓' : 'FAIL ✗'}`);
}

main().catch(err => {
	console.error('FATAL:', err.message);
	process.exit(1);
});
