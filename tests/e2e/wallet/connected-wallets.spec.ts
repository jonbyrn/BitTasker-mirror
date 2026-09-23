import { test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let NSEC = '';
try {
	NSEC = readFileSync(join(process.cwd(), 'test-nsec.txt'), 'utf8').trim();
} catch {
	NSEC = '';
}

async function loginViaNsec(page: import('@playwright/test').Page) {
	await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
	await page.evaluate((nsec: string) => {
		localStorage.setItem('nostr_nsec', nsec);
		localStorage.setItem('auth_method', 'nsec');
		localStorage.setItem('nostr_login_done', 'true');
	}, NSEC);
}

test.describe('Connected Wallets — Visual Test', () => {
	test.beforeEach(({}, testInfo) => {
		if (!NSEC) testInfo.skip(true, 'test-nsec.txt is not configured');
	});

	test('Connected tab + connect modal + MetaMask error', async ({ page }) => {
		await loginViaNsec(page);
		await page.goto('http://localhost:3000/dashboard/wallet', {
			waitUntil: 'networkidle',
			timeout: 20000
		});
		await page.waitForTimeout(1000);
		await page.screenshot({ path: 'Screenshots/01-wallet.png', fullPage: true });

		const connectedTab = page.locator('text=Connected');
		if (!(await connectedTab.isVisible({ timeout: 3000 }).catch(() => false))) {
			console.log('Feature flag off — no Connected tab');
			return;
		}

		await connectedTab.click();
		await page.waitForTimeout(500);
		await page.screenshot({ path: 'Screenshots/02-connected-tab.png', fullPage: true });

		const connectBtn = page.locator('button', { hasText: 'Connect' });
		if (!(await connectBtn.isVisible({ timeout: 2000 }).catch(() => false))) return;
		await connectBtn.click();
		await page.waitForTimeout(500);
		await page.screenshot({ path: 'Screenshots/03-modal.png', fullPage: true });

		const mmBtn = page.locator('button', { hasText: 'MetaMask' }).first();
		if (!(await mmBtn.isVisible({ timeout: 2000 }).catch(() => false))) return;
		await mmBtn.click();
		await page.waitForTimeout(2000);
		await page.screenshot({ path: 'Screenshots/04-metamask-result.png', fullPage: true });
	});
});
