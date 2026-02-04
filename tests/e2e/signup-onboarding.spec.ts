/**
 * Signup & onboarding E2E: root → signup → Turnstile bypass → username → passkey creation → Recovery.
 *
 * Uses build + preview (see playwright.config.ts). Requires VITE_E2E_TURNSTILE_BYPASS and VITE_API_URL.
 * Auth fixture (CDP virtual authenticator) attaches to the test page. Run with --project=chromium.
 */
import { test, expect } from '../../src/lib/tests/e2e/fixtures/auth';

function e2eLog(message: string, stepLog: string[]): void {
	const line = `[E2E] ${message}`;
	stepLog.push(line);
	// eslint-disable-next-line no-console
	console.log(line);
}

test.describe('Signup and onboarding', () => {
	test('from root: signup → username → create passkey → reach Recovery step', async ({ page }) => {
		test.setTimeout(120_000);
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
		try {
			await page.getByTestId('onboarding-step-username').waitFor({ state: 'visible', timeout: 45_000 });
		} catch (e) {
			e2eLog(`Step 4 FAILED: onboarding not ready. URL=${page.url()}`, stepLog);
			await attachDiagnostics('signup-to-onboarding-failure');
			throw e;
		}
		await expect(page).toHaveURL(/\/auth\/onboarding/);

		// 5: Fill username and go to PasskeySetup step
		await page.getByTestId('onboarding-username-input').fill(uniqueUsername);
		await page.getByTestId('onboarding-username-next').click();
		const passkeySetupButton = page.getByTestId('passkey-setup-button');
		await expect(passkeySetupButton).toBeVisible({ timeout: 15_000 });
		e2eLog('Step 5: PasskeySetup visible; clicking Set up passkey', stepLog);

		// 6: Create passkey (virtual authenticator); wait for Recovery step or error
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
			e2eLog(`Step 6 FAILED: Passkey/registration error. URL=${page.url()}`, stepLog);
			await attachDiagnostics('passkey-creation-failure');
			throw new Error(
				`Passkey setup failed. Ensure VITE_API_URL is set to your dev backend and it is running. Error: ${(errorText || '').slice(0, 200)}`
			);
		}
		if (first !== 'recovery') {
			e2eLog(`Step 6 FAILED: Timeout. URL=${page.url()}`, stepLog);
			await attachDiagnostics('passkey-creation-failure');
			throw new Error(
				'Timeout waiting for Recovery step. Set VITE_API_URL to your dev backend and ensure it is running.'
			);
		}
		e2eLog('Step 6: Recovery step visible (passkey created, backend registration succeeded)', stepLog);
		await expect(page).toHaveURL(/\/auth\/onboarding/);
	});
});
