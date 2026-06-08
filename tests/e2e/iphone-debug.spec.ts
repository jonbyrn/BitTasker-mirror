import { test, devices } from '@playwright/test';

test.describe('iPhone Safari Debug', () => {
	test('detect 500 error on production with fresh session', async ({ browser }) => {
		const context = await browser.newContext({
			...devices['iPhone 12'],
			// Simulate fresh session (no cache, no storage)
			storageState: { cookies: [], origins: [] }
		});
		const page = await context.newPage();

		const errors: string[] = [];
		const consoleLogs: string[] = [];
		const networkErrors: { url: string; status: number; statusText: string }[] = [];
		const allResponses: { url: string; status: number; type: string }[] = [];

		page.on('console', (msg) => {
			consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
		});

		page.on('pageerror', (error) => {
			errors.push(`${error.name}: ${error.message}\n${error.stack}`);
		});

		page.on('requestfailed', (request) => {
			networkErrors.push({
				url: request.url(),
				status: 0,
				statusText: request.failure()?.errorText || 'unknown'
			});
		});

		page.on('response', (response) => {
			const url = response.url();
			const status = response.status();
			const type = response.request().resourceType();
			if (status >= 400 || type === 'script') {
				allResponses.push({ url, status, type });
			}
		});

		console.log('=== Navigating to https://bittasker.com (iPhone 12 fresh session) ===');
		const response = await page.goto('https://bittasker.com', {
			waitUntil: 'domcontentloaded',
			timeout: 30000
		});

		// Wait for the app to potentially boot or fail
		await page.waitForTimeout(5000);

		console.log(`\nHTTP Status: ${response?.status()}`);
		console.log(`URL after load: ${page.url()}`);
		console.log(`Page title: "${await page.title()}"`);

		// Check DOM state
		const bodyHTML = await page.evaluate(() => document.body.innerHTML.substring(0, 2000));
		console.log(`\n=== BODY HTML (first 2000 chars) ===`);
		console.log(bodyHTML);

		// Check for error indicators
		const bodyText = await page.textContent('body');
		const hasServerError = bodyText?.includes('Server Error');
		const has500 = (await page.title()).includes('500');
		const hasErrorComponent = await page.$('[class*="card"]');
		const hasAppShell = await page.$('.app-shell');

		console.log(`\n=== PAGE STATE ===`);
		console.log(`Has "Server Error" text: ${hasServerError}`);
		console.log(`Title contains "500": ${has500}`);
		console.log(`Has card element: ${!!hasErrorComponent}`);
		console.log(`Has app-shell: ${!!hasAppShell}`);

		// Check if JS initialized
		const svelteInitialized = await page.evaluate(() => {
			return !!document.querySelector('[data-theme]');
		});
		console.log(`Svelte app initialized (data-theme attr): ${svelteInitialized}`);

		// Check for the error page's specific elements
		const errorPageDetected = await page.evaluate(() => {
			const h1 = document.querySelector('h1');
			return h1?.textContent?.includes('Server Error') || h1?.textContent?.includes('went wrong');
		});
		console.log(`Error page detected (h1 check): ${errorPageDetected}`);

		// Check script loading
		const scriptCount = await page.evaluate(() => {
			return document.querySelectorAll('script').length;
		});
		console.log(`Script tags in DOM: ${scriptCount}`);

		if (errors.length > 0) {
			console.log('\n=== JS ERRORS ===');
			errors.forEach((e) => console.log(e));
		}

		if (networkErrors.length > 0) {
			console.log('\n=== NETWORK ERRORS (failed requests) ===');
			networkErrors.forEach((r) => console.log(`${r.status} ${r.statusText}: ${r.url}`));
		}

		if (allResponses.length > 0) {
			console.log('\n=== SCRIPT/ERROR RESPONSES ===');
			allResponses.forEach((r) => console.log(`${r.status} [${r.type}]: ${r.url}`));
		}

		if (consoleLogs.length > 0) {
			console.log('\n=== ALL CONSOLE LOGS ===');
			consoleLogs.forEach((l) => console.log(l));
		}

		await page.screenshot({ path: 'test-results/iphone-fresh-session.png', fullPage: true });
	});

	test('compare: desktop Chrome fresh load', async ({ browser }) => {
		const context = await browser.newContext({
			storageState: { cookies: [], origins: [] }
		});
		const page = await context.newPage();

		const errors: string[] = [];
		page.on('pageerror', (error) => {
			errors.push(`${error.name}: ${error.message}`);
		});

		await page.goto('https://bittasker.com', {
			waitUntil: 'domcontentloaded',
			timeout: 30000
		});

		await page.waitForTimeout(5000);

		const title = await page.title();
		const hasAppShell = await page.$('.app-shell');
		const svelteInitialized = await page.evaluate(() => !!document.querySelector('[data-theme]'));
		const bodyText = await page.textContent('body');

		console.log(`\n=== DESKTOP CHROME ===`);
		console.log(`Title: "${title}"`);
		console.log(`App shell: ${!!hasAppShell}`);
		console.log(`Svelte initialized: ${svelteInitialized}`);
		console.log(`Has "Server Error": ${bodyText?.includes('Server Error')}`);
		if (errors.length) console.log(`Errors:`, errors.join('\n'));

		await page.screenshot({ path: 'test-results/chrome-fresh-session.png', fullPage: true });
	});
});
