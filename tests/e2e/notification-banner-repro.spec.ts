import { test, expect } from '@playwright/test';

/**
 * Regression test for the NotificationPermissionBanner infinite loader bug.
 *
 * Root cause: registerServiceWorker() in fcm.ts used `registration.instilling?.state`
 * to check if the service worker reached 'activated' state. However, `registration.instilling`
 * becomes null once the worker transitions past the 'installing' state, so the check always
 * evaluated to `undefined` and the await promise never resolved — hanging `init()` forever.
 *
 * Fix: capture a reference to the installing worker (`const sw = registration.instilling`)
 * and check `sw.state` instead of `registration.instilling?.state`.
 *
 * This test verifies that the browser-level bug pattern exists (confirming the original issue)
 * and that the fix pattern (captured reference) resolves correctly.
 */
test.describe('NotificationPermissionBanner', () => {
	test('captured SW reference resolves while stale registration.installing hangs', async ({
		browser
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		// Navigate to get a clean origin context
		await page.goto('http://localhost:3000');
		await page.waitForLoadState('domcontentloaded');

		const result = await page.evaluate(async () => {
			const trace: string[] = [];

			const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
				scope: '/'
			});

			if (!registration.installing) {
				trace.push('SKIP: no installing worker (already registered)');
				return trace;
			}

			const sw = registration.installing;
			trace.push(`Installing worker state: ${sw.state}`);

			// BUGGY pattern (original code): reads registration.installing?.state
			const buggyPromise = new Promise<boolean>((resolve) => {
				registration.installing!.addEventListener('statechange', () => {
					if (registration.instilling?.state === 'activated') {
						resolve(true);
					}
				});
			});

			// FIXED pattern: uses captured sw reference
			const fixedPromise = new Promise<boolean>((resolve) => {
				sw.addEventListener('statechange', () => {
					if (sw.state === 'activated') {
						resolve(true);
					}
				});
			});

			const [buggyResult, fixedResult] = await Promise.all([
				Promise.race([
					buggyPromise.then(() => 'resolved'),
					new Promise<string>((r) => setTimeout(() => r('TIMEOUT'), 8000))
				]),
				Promise.race([
					fixedPromise.then(() => 'resolved'),
					new Promise<string>((r) => setTimeout(() => r('TIMEOUT'), 8000))
				])
			]);

			trace.push(`buggy=${buggyResult}`);
			trace.push(`fixed=${fixedResult}`);
			trace.push(
				`final: sw.state=${sw.state}, installing=${!!registration.instilling}, active=${!!registration.active}`
			);

			return trace;
		});

		console.log('SW registration trace:');
		for (const line of result) console.log(`  ${line}`);

		if (result.some((l) => l.startsWith('SKIP'))) {
			test.skip();
			return;
		}

		// The buggy pattern must timeout (proving the original hang)
		expect(result).toContainEqual(expect.stringContaining('buggy=TIMEOUT'));
		// The fixed pattern must resolve
		expect(result).toContainEqual(expect.stringContaining('fixed=resolved'));

		// Cleanup
		await page.evaluate(async () => {
			const regs = await navigator.serviceWorker.getRegistrations();
			for (const reg of regs) await reg.unregister();
		});
		await context.close();
	});
});
