import { test, expect } from '@playwright/test';

/** Log to stdout (visible in CI) and optionally to a collector for attachment */
function e2eLog(message: string, stepLog: string[]): void {
	const line = `[E2E] ${message}`;
	stepLog.push(line);
	// eslint-disable-next-line no-console
	console.log(line);
}

/**
 * Signup & onboarding E2E: root → signup → Turnstile bypass → username → PasskeySetup step.
 *
 * Requires:
 * - Turnstile bypass: run with local webServer (Playwright config sets VITE_E2E_TURNSTILE_BYPASS=true).
 * - Dev backend: set VITE_API_URL to dev API so checkUsernameAvailability succeeds (e.g. VITE_API_URL=https://api.dev.bittasker.com).
 *
 * Checkpoint: we assert the user reaches the "Set up passkey" step. Getting there validates we can call the dev backend (username availability check).
 */
test.describe('Signup and onboarding to passkey step', () => {
	// CI can be slow: navigation after Continue click may take several seconds; allow time for full flow
	test('from root: signup → bypass Turnstile → enter username → reach Set up passkey step', async ({
		page
	}) => {
		test.setTimeout(60_000);
		const takeScreenshots = process.env.E2E_SCREENSHOTS === '1';
		const uniqueUsername = `e2e-${Date.now()}`;
		const stepLog: string[] = [];

		// Capture page console so we can attach on failure (CI and locally)
		const consoleMessages: string[] = [];
		page.on('console', (msg) => {
			const text = msg.text();
			const type = msg.type();
			consoleMessages.push(`[${type}] ${text}`);
		});

		const attachDiagnostics = async (label: string) => {
			await test.info().attach(`${label}-step-log.txt`, {
				body: stepLog.join('\n'),
				contentType: 'text/plain'
			});
			await test.info().attach(`${label}-console.txt`, {
				body: consoleMessages.join('\n') || '(no console messages)',
				contentType: 'text/plain'
			});
		};

		// 1. Open root page
		e2eLog(`Step 1: goto / (CI=${!!process.env.CI})`, stepLog);
		await page.goto('/');
		await expect(page).toHaveURL(/\//);
		e2eLog(`Step 1 done: URL=${page.url()}`, stepLog);
		if (takeScreenshots) await page.screenshot({ path: 'test-results/01-root.png' });

		// 2. Click signup (hero CTA)
		e2eLog('Step 2: click signup link', stepLog);
		const signupLink = page.getByTestId('signup-link');
		await expect(signupLink).toBeVisible({ timeout: 15_000 });
		await signupLink.click();

		// 3. Signup page → Continue (bypass)
		await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 10_000 });
		e2eLog(`Step 3: on signup page URL=${page.url()}`, stepLog);
		if (takeScreenshots) await page.screenshot({ path: 'test-results/02-signup-page.png' });
		const continueBtn = page.getByTestId('signup-continue');
		await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
		e2eLog('Step 3: Continue button enabled; clicking and waiting for navigation to /auth/onboarding', stepLog);
		// Wait for navigation triggered by the click. In CI navigation can take 2+ seconds; don't assert URL before it completes.
		try {
			await Promise.all([
				page.waitForURL(/\/auth\/onboarding/, { timeout: 20_000 }),
				continueBtn.click()
			]);
		} catch (e) {
			e2eLog(`Step 4 FAILED: navigation did not complete. URL=${page.url()}`, stepLog);
			await attachDiagnostics('signup-to-onboarding-failure');
			throw e;
		}
		e2eLog(`Step 4: on onboarding URL=${page.url()}`, stepLog);
		const usernameStep = page.getByTestId('onboarding-step-username');
		await expect(usernameStep).toBeVisible({ timeout: 10_000 });
		const usernameInput = page.getByTestId('onboarding-username-input');
		await usernameInput.fill(uniqueUsername);
		if (takeScreenshots) await page.screenshot({ path: 'test-results/03-onboarding-username-filled.png' });

		const usernameNextBtn = page.getByTestId('onboarding-username-next');
		await expect(usernameNextBtn).toBeVisible({ timeout: 5_000 });
		await usernameNextBtn.click();

		// 5. Checkpoint: PasskeySetup step is visible ("Set up passkey"). Reaching here validates dev backend (username check) worked.
		const passkeyStep = page.getByTestId('onboarding-step-passkey');
		await expect(passkeyStep).toBeVisible({ timeout: 15_000 });
		const passkeySetupButton = page.getByTestId('passkey-setup-button');
		await expect(passkeySetupButton).toBeVisible({ timeout: 5_000 });
		await expect(passkeySetupButton).toContainText(/set up passkey|configurar passkey/i);
		if (takeScreenshots) await page.screenshot({ path: 'test-results/04-onboarding-passkey-step.png' });
	});
});
