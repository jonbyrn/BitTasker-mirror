import { test } from '@playwright/test';
test('Check', async ({ page }) => {
	await page.goto('http://localhost:3000/dashboard/wallet', {
		waitUntil: 'networkidle',
		timeout: 20000
	});
	await page.waitForTimeout(2000);
	const html = await page.content();
	console.log('Has Connected text:', html.includes('Connected'));
	console.log('Body length:', html.length);
	await page.screenshot({ path: 'Screenshots/check-flags.png', fullPage: true });
});
