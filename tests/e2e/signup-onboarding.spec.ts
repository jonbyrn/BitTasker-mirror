/**
 * Signup, onboarding & login E2E: two tests sharing the same browser context.
 *
 * Test 1: Root → signup → Turnstile bypass → username → passkey creation
 *   → Recovery (skip) → Profile (fill) → Location (default) → Complete (continue without)
 *   → Dashboard.
 *
 * Test 2: Root (fresh UI) → Login button → passkey login → Dashboard.
 *
 * Uses worker-scoped sharedAuthContext so the passkey from Test 1 is available in Test 2.
 * Requires VITE_E2E_TURNSTILE_BYPASS and VITE_API_URL.
 *
 * Run (recommended, dev server): E2E_USE_DEV_SERVER=1 VITE_API_URL=... npx playwright test ... --project=chromium
 */
import { test, expect } from './fixtures/signup-login-auth';

function e2eLog(message: string, stepLog: string[]): void {
	const line = `[E2E] ${message}`;
	stepLog.push(line);
	// eslint-disable-next-line no-console
	console.log(line);
}

/** 100+ chars for profile description minimum requirement */
const E2E_PROFILE_DESCRIPTION =
	'E2E test user profile. Experienced in various professional domains including software development, testing, and automation. Ready to take on tasks and deliver quality work.';

test.describe.serial('Signup, onboarding and login', () => {
	test('from root: signup → full onboarding → dashboard', async ({ page }) => {
		test.setTimeout(180_000);
		const ts = Date.now();
		const uniqueUsername = `e2e-${ts}`;
		const displayName = `e2e-user-${ts}`;
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

		// 7: Skip recovery; click Next
		await page.getByTestId('onboarding-recovery-next').click();
		await page.getByTestId('onboarding-step-profile').waitFor({ state: 'visible', timeout: 15_000 });
		e2eLog('Step 7: Profile step visible', stepLog);

		// 8: Fill profile (display name, professional title, description 100+ chars, 2 skills; no picture)
		await page.getByTestId('onboarding-display-name').fill(displayName);
		await page.getByTestId('onboarding-professional-title').fill('E2E Test Professional');
		await page.getByTestId('onboarding-profile-description').fill(E2E_PROFILE_DESCRIPTION);

		// Add 2 skills via multiselect (type + Enter)
		const skillsInput = page.getByTestId('onboarding-skills').getByRole('combobox');
		await skillsInput.fill('JavaScript');
		await skillsInput.press('Enter');
		await skillsInput.fill('Testing');
		await skillsInput.press('Enter');

		await page.getByTestId('onboarding-profile-next').click();
		await page.getByTestId('onboarding-step-location').waitFor({ state: 'visible', timeout: 30_000 });
		e2eLog('Step 8: Profile submitted; Location step visible', stepLog);

		// 9: Location step – use default; click Next
		await page.getByTestId('onboarding-location-next').click();
		await page.getByTestId('onboarding-step-complete').waitFor({ state: 'visible', timeout: 30_000 });
		e2eLog('Step 9: Complete step visible', stepLog);

		// 10: Continue without completing (missing picture etc.) → dashboard
		await page.getByTestId('onboarding-continue-without-completing').click();
		await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
		e2eLog('Step 10: Navigated to dashboard', stepLog);
	});

	test('from root: Login → passkey → dashboard', async ({ page }) => {
		test.setTimeout(60_000);
		const stepLog: string[] = [];
		const gotoOptions = { waitUntil: 'load' as const };

		// 1: Load app, clear auth state (simulate fresh user / logout)
		e2eLog('Step 1: Goto /, clear auth state', stepLog);
		await page.goto('/', gotoOptions);
		await page.evaluate(() => {
			const prefix = 'CapacitorStorage.';
			['access_token', 'npub', 'auth_method'].forEach((k) =>
				localStorage.removeItem(prefix + k)
			);
		});

		// 2: Root page (logged out) → click Login (not Signup)
		e2eLog('Step 2: Reload; on root; clicking Login', stepLog);
		await page.goto('/', gotoOptions);
		await expect(page).toHaveURL(/\//);
		await page.getByTestId('login-link').click();
		await page.waitForLoadState('domcontentloaded');
		await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });

		// 3: Click passkey login (uses credential from Test 1)
		e2eLog('Step 3: Clicking Continue with passkey', stepLog);
		await page.getByTestId('login-continue-passkey').click();
		await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
		e2eLog('Step 4: Logged in; navigated to dashboard', stepLog);
	});
});
