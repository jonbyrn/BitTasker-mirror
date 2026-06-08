import { test, devices } from '@playwright/test';

const BASE = process.env.PW_E2E_BASE_URL || 'http://127.0.0.1:4173';

test('iPhone Safari - local build', async ({ browser }) => {
	const context = await browser.newContext({
		...devices['iPhone 12'],
		storageState: { cookies: [], origins: [] }
	});
	const page = await context.newPage();

	const errors: string[] = [];
	const consoleLogs: string[] = [];

	page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
	page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}\n${error.stack}`));

	console.log(`Navigating to ${BASE} with iPhone 12 emulation...`);
	await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
	await page.waitForTimeout(5000);

	const title = await page.title();
	const hasAppShell = await page.$('.app-shell');
	const svelteInitialized = await page.evaluate(() => !!document.querySelector('[data-theme]'));
	const bodyText = (await page.textContent('body')) || '';
	const hasServerError = bodyText.includes('Server Error');
	const h1Text = await page.evaluate(() => document.querySelector('h1')?.textContent || 'none');

	console.log(`\n=== LOCAL BUILD (iPhone 12 emulation) ===`);
	console.log(`Title: "${title}"`);
	console.log(`App shell: ${!!hasAppShell}`);
	console.log(`Svelte initialized: ${svelteInitialized}`);
	console.log(`Has "Server Error": ${hasServerError}`);
	console.log(`H1 text: ${h1Text}`);
	console.log(`Body text (first 500): ${bodyText.substring(0, 500)}`);

	if (errors.length) {
		console.log(`\n=== JS ERRORS ===`);
		errors.forEach((e) => console.log(e));
	}
	if (consoleLogs.length) {
		console.log(`\n=== CONSOLE ===`);
		consoleLogs.forEach((l) => console.log(l));
	}

	await page.screenshot({ path: 'test-results/local-iphone.png', fullPage: true });
});
