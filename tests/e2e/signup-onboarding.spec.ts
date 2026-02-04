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
 * Uses build + preview (see playwright.config.ts); no dev cold start, so no CI warm-up needed.
 * Requires: VITE_E2E_TURNSTILE_BYPASS and VITE_API_URL set at build time (webServer env).
 */
test.describe('Signup and onboarding to passkey step', () => {
	test('from root: signup → bypass Turnstile → enter username → reach Set up passkey step', async ({
		page
	}) => {
		test.setTimeout(90_000);
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

		// Built app: waitUntil 'load' is enough; no HMR. Use networkidle only if needed for stability.
		const gotoOptions = { waitUntil: 'load' as const };

		// 1. Open root page
		e2eLog(`Step 1: goto / (CI=${!!process.env.CI})`, stepLog);
		await page.goto('/', gotoOptions);
		await expect(page).toHaveURL(/\//);
		const signupLink = page.getByTestId('signup-link');
		await expect(signupLink).toBeVisible({ timeout: 15_000 });
		e2eLog(`Step 1 done: URL=${page.url()}`, stepLog);
		if (takeScreenshots) await page.screenshot({ path: 'test-results/01-root.png' });

		// 2. Click signup (hero CTA)
		e2eLog('Step 2: click signup link', stepLog);
		await signupLink.click();
		await page.waitForLoadState('domcontentloaded');

		// 3. Signup page → Continue (bypass)
		await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 10_000 });
		e2eLog(`Step 3: on signup page URL=${page.url()}`, stepLog);
		if (takeScreenshots) await page.screenshot({ path: 'test-results/02-signup-page.png' });
		const continueBtn = page.getByTestId('signup-continue');
		await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
		e2eLog('Step 3: Continue button enabled; clicking then waiting for onboarding content', stepLog);
		// Click first, then wait for the onboarding page to be ready. We wait for the element we need
		// (username step) instead of only the URL — in CI the URL can update before SvelteKit finishes
		// rendering, and waiting for the content avoids flaky "right page but not ready" failures.
		try {
			await continueBtn.click();
			await page.getByTestId('onboarding-step-username').waitFor({ state: 'visible', timeout: 45_000 });
		} catch (e) {
			e2eLog(`Step 4 FAILED: onboarding not ready. URL=${page.url()}`, stepLog);
			await attachDiagnostics('signup-to-onboarding-failure');
			throw e;
		}
		await expect(page).toHaveURL(/\/auth\/onboarding/);
		e2eLog(`Step 4: on onboarding, username step visible. URL=${page.url()}`, stepLog);
		const usernameStep = page.getByTestId('onboarding-step-username');
		// Already visible from waitFor above; keep for clarity and quick re-check
		await expect(usernameStep).toBeVisible({ timeout: 5_000 });
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
