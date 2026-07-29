import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const CDP_URL = 'http://localhost:9222';

async function run() {
	console.log('Connecting to Chrome at', CDP_URL);
	const browser = await chromium.connectOverCDP(CDP_URL);
	const context = browser.contexts()[0] || await browser.newContext();
	const page = context.pages()[0] || await context.newPage();

	let passed = 0;
	let failed = 0;

	function ok(label) { passed++; console.log('  PASS ' + label); }
	function fail(label, reason) { failed++; console.log('  FAIL ' + label + (reason ? ': ' + reason : '')); }

	const consoleErrors = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') consoleErrors.push(msg.text());
	});

	try {
		// 1. Navigate to wallet page
		console.log('\nStep 1: Navigate to wallet page');
		await page.goto(BASE_URL + '/dashboard/wallet', { waitUntil: 'networkidle', timeout: 15000 });
		await page.waitForTimeout(2000);
		ok('Wallet page loaded');

		// 2. Click Connected tab
		console.log('\nStep 2: Click Connected tab');
		const connectedTab = page.locator('button:has-text("Connected")');
		const tabCount = await connectedTab.count();
		if (tabCount > 0) {
			await connectedTab.first().click();
			await page.waitForTimeout(1000);
			ok('Clicked Connected tab');
		} else {
			fail('Connected tab not found');
		}

		// 3. Check for connected wallet cards
		console.log('\nStep 3: Check connected wallet cards');
		const walletCards = page.locator('[class*="collapse"][class*="border-primary"]');
		const cardCount = await walletCards.count();
		if (cardCount > 0) {
			ok('Found ' + cardCount + ' connected wallet card(s)');
		} else {
			console.log('  WARN: No connected wallet cards found');
		}

		// 4. Look for Activity accordion
		console.log('\nStep 4: Look for Activity accordion');
		const activityAccordion = page.locator('button:has-text("Activity"), [class*="collapse"]:has-text("Activity")');
		const accCount = await activityAccordion.count();
		if (accCount > 0) {
			await activityAccordion.first().click();
			await page.waitForTimeout(500);
			ok('Activity accordion found and clicked');
		} else {
			console.log('  WARN: Activity accordion not visible');
		}

		// 5. Look for Transactions button
		console.log('\nStep 5: Look for Transactions button');
		const txButton = page.locator('button:has-text("Transactions")');
		const txBtnCount = await txButton.count();
		if (txBtnCount > 0) {
			await txButton.first().click();
			await page.waitForTimeout(2000);
			ok('Transactions button found and clicked');
		} else {
			console.log('  WARN: Transactions button not found (may need wallets connected)');
		}

		// 6. Check for transaction history modal content
		console.log('\nStep 6: Check for transaction history modal');
		const filterAll = page.locator('button:has-text("All")');
		const filterCount = await filterAll.count();
		if (filterCount > 0) {
			ok('Found filter buttons');
		} else {
			console.log('  WARN: Filter buttons not found');
		}

		const networkDropdown = page.locator('button:has-text("All Networks"), button:has-text("Rootstock")');
		const netCount = await networkDropdown.count();
		if (netCount > 0) {
			ok('Network dropdown present');
		} else {
			console.log('  WARN: Network dropdown not found');
		}

		const walletDropdown = page.locator('button:has-text("All Wallets"), button:has-text("MetaMask"), button:has-text("Ledger"), button:has-text("Trezor")');
		const wCount = await walletDropdown.count();
		if (wCount > 0) {
			ok('Wallet dropdown present');
		} else {
			console.log('  WARN: Wallet dropdown not found');
		}

		// 7. Check for transaction cards or empty state
		console.log('\nStep 7: Check for transaction cards or empty state');
		const txCards = page.locator('[class*="cursor-pointer"][role="button"]');
		const txCardCount = await txCards.count();
		if (txCardCount > 0) {
			ok('Found ' + txCardCount + ' transaction card(s)');
		} else {
			const emptyMsg = page.locator('text=/No transactions/i');
			const emptyCount = await emptyMsg.count();
			if (emptyCount > 0) {
				ok('Empty state message displayed');
			} else {
				console.log('  INFO: No cards and no empty state (modal may not have opened)');
			}
		}

		// 8. Check for PendingClaimBanner
		console.log('\nStep 8: Check for PendingClaimBanner');
		const claimBanner = page.locator('text=/Lightning Payment Received|Claim RBTC/i');
		const claimCount = await claimBanner.count();
		if (claimCount > 0) {
			ok('PendingClaimBanner is present');
		} else {
			console.log('  INFO: No pending claims (expected)');
		}

		// 9. Console errors
		console.log('\nStep 9: Console errors check');
		const criticalErrors = consoleErrors.filter(
			(e) => !e.includes('favicon') && !e.includes('404') && !e.includes('WebSocket') && !e.includes('net::')
		);
		if (criticalErrors.length === 0) {
			ok('No critical console errors');
		} else {
			fail(criticalErrors.length + ' critical console error(s)');
			criticalErrors.slice(0, 3).forEach((e) => console.log('    -> ' + e.slice(0, 150)));
		}

	} catch (err) {
		fail('Test execution', err.message);
	}

	console.log('\n' + '='.repeat(50));
	console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
	console.log('='.repeat(50));

	await browser.close();
	process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
