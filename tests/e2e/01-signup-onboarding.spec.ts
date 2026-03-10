/**
 * File 1 of 2: Creates two users and writes their passkey credentials to the file.
 *
 * Test 1: Signup (root → signup → Turnstile bypass) → username → passkey creation
 *   → Recovery (skip) → Profile → Location → Complete → Dashboard.
 *   Teardown writes credentials to webauthn-credentials.json with label "signup".
 *
 * Test 2: Nostr signup (login → Login with nsec → submit → passkey automatic → land on profile)
 *   → fill profile → location → complete → Dashboard.
 *   Teardown writes credentials with label "nostr".
 *
 * Run first, then run 02-credentials-login.spec.ts. Use --workers=1 so file order is respected:
 *   npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts --project=chromium --workers=1
 *
 * Requires VITE_E2E_TURNSTILE_BYPASS and VITE_API_URL.
 */
import { nip19, generateSecretKey } from 'nostr-tools';
import { test, expect } from './fixtures/signup-login-auth';

function e2eLog(message: string, stepLog: string[]): void {
	const line = `[E2E] ${message}`;
	stepLog.push(line);
	 
	console.log(line);
}

const E2E_PROFILE_DESCRIPTION =
	'E2E test user profile. Experienced in various professional domains including software development, testing, and automation. Ready to take on tasks and deliver quality work.';

test.describe.serial('Signup and onboarding (create credentials file)', () => {
	test('user 1: signup → full onboarding → dashboard', async ({ page }) => {
		test.setTimeout(180_000);
		const ts = Date.now();
		const uniqueUsername = `e2e-${ts}`;
		// Use same value as username so Nostr profile "name" matches; messages E2E searches by this
		const displayName = uniqueUsername;
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
			await page
				.getByTestId('onboarding-step-username')
				.waitFor({ state: 'visible', timeout: 45_000 });
		} catch (e) {
			e2eLog(`Step 4 FAILED: onboarding not ready. URL=${page.url()}`, stepLog);
			await attachDiagnostics('signup-to-onboarding-failure');
			throw e;
		}
		await expect(page).toHaveURL(/\/auth\/onboarding/);

		await page.getByTestId('onboarding-username-input').fill(uniqueUsername);
		await page.getByTestId('onboarding-username-next').click();
		const passkeySetupButton = page.getByTestId('passkey-setup-button');
		await expect(passkeySetupButton).toBeVisible({ timeout: 15_000 });
		e2eLog('Step 5: PasskeySetup visible; clicking Set up passkey', stepLog);

		await passkeySetupButton.click();
		const recoveryLocator = page.getByTestId('onboarding-step-recovery');
		const errorLocator = page.getByTestId('passkey-setup-error');
		const timeoutMs = 60_000;
		const first = await Promise.race([
			recoveryLocator
				.waitFor({ state: 'visible', timeout: timeoutMs })
				.then(() => 'recovery' as const),
			errorLocator.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'error' as const)
		]).catch(() => null);

		if (first === 'error') {
			const errorText = await errorLocator.textContent().catch(() => '');
			e2eLog(`Step 6 FAILED: Passkey/registration error. URL=${page.url()}`, stepLog);
			await attachDiagnostics('passkey-creation-failure');
			throw new Error(
				`Passkey setup failed. Ensure VITE_API_URL is set and backend is running. Error: ${(errorText || '').slice(0, 200)}`
			);
		}
		if (first !== 'recovery') {
			e2eLog(`Step 6 FAILED: Timeout. URL=${page.url()}`, stepLog);
			await attachDiagnostics('passkey-creation-failure');
			throw new Error(
				'Timeout waiting for Recovery step. Set VITE_API_URL to your dev backend and ensure it is running.'
			);
		}
		e2eLog('Step 6: Recovery step visible (passkey created)', stepLog);

		await page.getByTestId('onboarding-recovery-next').click();
		await page
			.getByTestId('onboarding-step-profile')
			.waitFor({ state: 'visible', timeout: 15_000 });
		e2eLog('Step 7: Profile step visible', stepLog);

		await page.getByTestId('onboarding-display-name').fill(displayName);
		await page.getByTestId('onboarding-professional-title').fill('E2E Test Professional');
		await page.getByTestId('onboarding-profile-description').fill(E2E_PROFILE_DESCRIPTION);
		const skillsInput = page.getByTestId('onboarding-skills').getByRole('combobox');
		await skillsInput.fill('JavaScript');
		await skillsInput.press('Enter');
		await skillsInput.fill('Testing');
		await skillsInput.press('Enter');
		await page.getByTestId('onboarding-profile-next').click();
		await page
			.getByTestId('onboarding-step-location')
			.waitFor({ state: 'visible', timeout: 30_000 });
		e2eLog('Step 8: Location step visible', stepLog);

		await page.getByTestId('onboarding-location-next').click();
		await page
			.getByTestId('onboarding-step-complete')
			.waitFor({ state: 'visible', timeout: 30_000 });
		e2eLog('Step 9: Complete step visible', stepLog);

		await page.getByTestId('onboarding-continue-without-completing').click();
		await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
		e2eLog('Step 10: Navigated to dashboard', stepLog);
	});

	test.use({ credentialExportLabel: 'nostr' });
	// New user: nsec submit → passkey happens automatically → we land on profile step, then location → complete.
	test('user 2: Nostr login (new user) → profile → location → complete onboarding', async ({
		page
	}) => {
		test.setTimeout(180_000);
		const ts = Date.now();
		const displayName = `e2e-nostr-${ts}`;
		const stepLog: string[] = [];
		const gotoOptions = { waitUntil: 'load' as const };

		const nsec = nip19.nsecEncode(generateSecretKey());
		e2eLog('Step 1: goto /auth/login', stepLog);
		await page.goto('/auth/login', gotoOptions);
		await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });

		e2eLog(
			'Step 2: Login with nsec, submit (passkey runs automatically); we land on profile step',
			stepLog
		);
		await page.getByTestId('login-with-nsec').click();
		await page.getByTestId('login-nsec-input').fill(nsec);
		await page.getByTestId('login-submit').click();
		await page.waitForURL(/\/auth\/onboarding/, { timeout: 30_000 });
		await page
			.getByTestId('onboarding-step-profile')
			.waitFor({ state: 'visible', timeout: 30_000 });
		e2eLog('Step 3: Profile step visible; fill and next', stepLog);
		await page.getByTestId('onboarding-display-name').fill(displayName);
		await page.getByTestId('onboarding-professional-title').fill('E2E Nostr Professional');
		await page.getByTestId('onboarding-profile-description').fill(E2E_PROFILE_DESCRIPTION);
		const skillsInput = page.getByTestId('onboarding-skills').getByRole('combobox');
		await skillsInput.fill('TypeScript');
		await skillsInput.press('Enter');
		await skillsInput.fill('E2E');
		await skillsInput.press('Enter');
		await page.getByTestId('onboarding-profile-next').click();
		await page
			.getByTestId('onboarding-step-location')
			.waitFor({ state: 'visible', timeout: 30_000 });
		e2eLog('Step 4: Location step visible; next → complete', stepLog);

		await page.getByTestId('onboarding-location-next').click();
		await page
			.getByTestId('onboarding-step-complete')
			.waitFor({ state: 'visible', timeout: 30_000 });
		await page.getByTestId('onboarding-continue-without-completing').click();
		await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
		e2eLog('Step 5: Nostr user onboarding complete; dashboard', stepLog);
	});
});
