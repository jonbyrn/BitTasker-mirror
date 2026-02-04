/**
 * Signup & onboarding E2E: root → signup → Turnstile bypass → username → PasskeySetup → (optional) passkey creation → Recovery.
 *
 * Uses build + preview (see playwright.config.ts); no dev cold start. Requires VITE_E2E_TURNSTILE_BYPASS
 * and VITE_API_URL at build time. The "passkey creation" test uses the auth fixture (CDP virtual
 * authenticator) and runs on Chromium only.
 */
import { test, expect } from '../../src/lib/tests/e2e/fixtures/auth';

/** Log to stdout (visible in CI) and optionally to a collector for attachment */
function e2eLog(message: string, stepLog: string[]): void {
	const line = `[E2E] ${message}`;
	stepLog.push(line);
	// eslint-disable-next-line no-console
	console.log(line);
}

test.describe('Signup and onboarding', () => {
	// Run with --project=chromium when executing this file; virtual authenticator is CDP-only.

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

	test('from root: signup → username → create passkey → reach Recovery step', async ({ page }) => {
		test.setTimeout(120_000);
		const takeScreenshots = process.env.E2E_SCREENSHOTS === '1';
		const uniqueUsername = `e2e-${Date.now()}`;
		const stepLog: string[] = [];

		const consoleMessages: string[] = [];
		page.on('console', (msg) => {
			consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
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

		const gotoOptions = { waitUntil: 'load' as const };

		// 1–4: Root → signup → Continue → onboarding username step
		e2eLog('Step 1: goto /', stepLog);
		await page.goto('/', gotoOptions);
		await expect(page).toHaveURL(/\//);
		await page.getByTestId('signup-link').click();
		await page.waitForLoadState('domcontentloaded');
		await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 10_000 });
		const continueBtn = page.getByTestId('signup-continue');
		await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
		await continueBtn.click();
		await page.getByTestId('onboarding-step-username').waitFor({ state: 'visible', timeout: 45_000 });
		await expect(page).toHaveURL(/\/auth\/onboarding/);

		// 5: Fill username and go to PasskeySetup step
		await page.getByTestId('onboarding-username-input').fill(uniqueUsername);
		await page.getByTestId('onboarding-username-next').click();
		const passkeyStep = page.getByTestId('onboarding-step-passkey');
		await expect(passkeyStep).toBeVisible({ timeout: 15_000 });
		const passkeySetupButton = page.getByTestId('passkey-setup-button');
		await expect(passkeySetupButton).toBeVisible({ timeout: 5_000 });
		e2eLog('Step 5: PasskeySetup step visible; clicking Set up passkey', stepLog);
		if (takeScreenshots) await page.screenshot({ path: 'test-results/05-before-passkey-click.png' });

		// 6: Create passkey (virtual authenticator receives credential); wait for Recovery step or error
		await passkeySetupButton.click();
		const recoveryLocator = page.getByTestId('onboarding-step-recovery');
		const errorLocator = page.getByTestId('passkey-setup-error');
		const timeoutMs = 60_000;
		const first = await Promise.race([
			recoveryLocator.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'recovery' as const),
			errorLocator.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'error' as const)
		]).catch(() => null);

		if (first === 'error') {
			const errorText = await errorLocator.textContent().catch(() => '');
			e2eLog(`Step 6 FAILED: Passkey/registration error shown. URL=${page.url()}`, stepLog);
			await attachDiagnostics('passkey-creation-failure');
			if (takeScreenshots) await page.screenshot({ path: 'test-results/06-passkey-failure.png' });
			throw new Error(
				`Passkey setup failed (error shown on page). Ensure VITE_API_URL is set to your dev backend and the backend is running. Error snippet: ${(errorText || '').slice(0, 200)}`
			);
		}
		if (first !== 'recovery') {
			e2eLog(`Step 6 FAILED: Timeout waiting for Recovery or error. URL=${page.url()}`, stepLog);
			await attachDiagnostics('passkey-creation-failure');
			if (takeScreenshots) await page.screenshot({ path: 'test-results/06-passkey-failure.png' });
			throw new Error(
				'Timeout waiting for Recovery step or error. Passkey creation or backend registration may have failed. Set VITE_API_URL to your dev backend and ensure it is running.'
			);
		}
		e2eLog('Step 6: Recovery step visible (passkey created, backend registration + login succeeded)', stepLog);
		await expect(page).toHaveURL(/\/auth\/onboarding/);
		if (takeScreenshots) await page.screenshot({ path: 'test-results/06-onboarding-recovery-step.png' });
	});
});
