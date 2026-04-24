/**
 * File 1 of 2: Creates two users and writes their passkey credentials to the file.
 *
 * Test 1: Signup (root → signup → Turnstile bypass) → display name → passkey creation
 *   → Profile → Recovery (skip) → Complete → Dashboard.
 *   Teardown writes credentials to webauthn-credentials.json with label "signup".
 *
 * Test 2: Nostr signup (login → Login with nsec → submit → passkey automatic → land on profile)
 *   → fill profile → recovery (skip) → complete → Dashboard.
 *   Teardown writes credentials with label "nostr".
 *
 * New step order (5 steps total):
 *   0: DisplayName → 1: Passkey → 2: Profile → 3: Recovery → 4: Complete
 *   (Location step has been removed)
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
		// Use same value as display name so Nostr profile "name" matches; messages E2E searches by this
		const displayName = `E2E User ${ts}`;
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

		// Step 1: Navigate to root, click signup link, bypass Turnstile
		e2eLog('Step 1: goto /', stepLog);
		await page.goto('/', gotoOptions);
		await expect(page).toHaveURL(/\//);
		await page.getByTestId('signup-link').click();
		await page.waitForLoadState('domcontentloaded');
		await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 10_000 });
		// Click ToS checkbox before continuing (required for signup to proceed)
		await page.getByTestId('signup-tos-checkbox').click();
		const continueBtn = page.getByTestId('signup-continue');
		await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
		await continueBtn.click();

		// Step 2: Wait for onboarding — first step is now DisplayName (not Username)
		e2eLog('Step 2: Waiting for onboarding display-name step', stepLog);
		try {
			await page
				.getByTestId('onboarding-step-display-name')
				.waitFor({ state: 'visible', timeout: 45_000 });
		} catch (e) {
			e2eLog(`Step 2 FAILED: onboarding not ready. URL=${page.url()}`, stepLog);
			await attachDiagnostics('signup-to-onboarding-failure');
			throw e;
		}
		await expect(page).toHaveURL(/\/auth\/onboarding/);

		// Step 3: Fill display name and proceed to passkey step
		e2eLog('Step 3: Fill display name and click next', stepLog);
		await page.getByTestId('onboarding-display-name-input').fill(displayName);
		await page.getByTestId('onboarding-display-name-next').click();

		// Step 4: Passkey setup
		const passkeySetupButton = page.getByTestId('passkey-setup-button');
		await expect(passkeySetupButton).toBeVisible({ timeout: 15_000 });
		e2eLog('Step 4: PasskeySetup visible; clicking Set up passkey', stepLog);

		await passkeySetupButton.click();
		const profileLocator = page.getByTestId('onboarding-step-profile');
		const errorLocator = page.getByTestId('passkey-setup-error');
		const timeoutMs = 60_000;
		const first = await Promise.race([
			profileLocator
				.waitFor({ state: 'visible', timeout: timeoutMs })
				.then(() => 'profile' as const),
			errorLocator.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'error' as const)
		]).catch(() => null);

		if (first === 'error') {
			const errorText = await errorLocator.textContent().catch(() => '');
			e2eLog(`Step 4 FAILED: Passkey/registration error. URL=${page.url()}`, stepLog);
			await attachDiagnostics('passkey-creation-failure');
			throw new Error(
				`Passkey setup failed. Ensure VITE_API_URL is set and backend is running. Error: ${(errorText || '').slice(0, 200)}`
			);
		}
		if (first !== 'profile') {
			e2eLog(`Step 4 FAILED: Timeout. URL=${page.url()}`, stepLog);
			await attachDiagnostics('passkey-creation-failure');
			throw new Error(
				'Timeout waiting for Profile step after passkey. Set VITE_API_URL to your dev backend and ensure it is running.'
			);
		}
		e2eLog('Step 5: Profile step visible (passkey created)', stepLog);

		// Step 5: Fill profile (no display name field here — it was moved to step 0)
		await page.getByTestId('onboarding-professional-title').fill('E2E Test Professional');
		await page.getByTestId('onboarding-profile-description').fill(E2E_PROFILE_DESCRIPTION);
		const skillsInput = page.getByTestId('onboarding-skills').getByRole('combobox');
		await skillsInput.fill('JavaScript');
		await skillsInput.press('Enter');
		await skillsInput.fill('Testing');
		await skillsInput.press('Enter');
		await page.getByTestId('onboarding-profile-next').click();

		// Step 6: Recovery step (now step 3 in the new order, after profile)
		await page
			.getByTestId('onboarding-step-recovery')
			.waitFor({ state: 'visible', timeout: 15_000 });
		e2eLog('Step 6: Recovery step visible', stepLog);

		// Skip recovery by clicking next without filling in any fields
		await page.getByTestId('onboarding-recovery-next').click();

		// Step 7: Complete step (no location step anymore)
		await page
			.getByTestId('onboarding-step-complete')
			.waitFor({ state: 'visible', timeout: 30_000 });
		e2eLog('Step 7: Complete step visible', stepLog);

		// Step 8: Go to dashboard — button is immediately visible (no loading state)
		await page.getByTestId('onboarding-go-to-dashboard').click();
		await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
		e2eLog('Step 8: Navigated to dashboard', stepLog);
	});

	// Title contains "Nostr" so fixture uses empty authenticator and writes label 'nostr'.
	// New user: nsec submit → passkey happens automatically → we land on profile step, then recovery → complete.
	test('user 2: Nostr login (new user) → profile → recovery → complete onboarding', async ({
		page
	}) => {
		test.setTimeout(180_000);
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

		// Wait for navigation away from login — the nsec flow involves several async steps:
		// API challenge → sign event → API encrypted data → derive wallet → setBiometricKey (WebAuthn) → nostrLogin → goto
		try {
			await page.waitForURL(/\/auth\/onboarding|\/dashboard/, { timeout: 90_000 });
		} catch (e) {
			e2eLog(`Step 2 FAILED: No navigation after nsec login. URL=${page.url()}`, stepLog);
			await attachDiagnostics('nsec-login-failure');
			throw e;
		}

		// If we ended up on dashboard (isNewUser=false or redirect), that's unexpected but not a hard failure
		if (page.url().includes('/dashboard')) {
			e2eLog(
				`Step 2 WARNING: Redirected to dashboard instead of onboarding. URL=${page.url()}`,
				stepLog
			);
			await attachDiagnostics('nsec-login-dashboard-redirect');
			throw new Error('Expected new nsec user to land on /auth/onboarding but got /dashboard');
		}

		e2eLog(`Step 2: Navigated to ${page.url()}`, stepLog);

		// After nsec login for a new user, we land directly on profile step (step 2)
		// Display name and passkey are handled automatically
		await page
			.getByTestId('onboarding-step-profile')
			.waitFor({ state: 'visible', timeout: 30_000 });
		e2eLog('Step 3: Profile step visible; fill and next', stepLog);

		// Profile step no longer has a display name field (moved to DisplayNameSetup step)
		await page.getByTestId('onboarding-professional-title').fill('E2E Nostr Professional');
		await page.getByTestId('onboarding-profile-description').fill(E2E_PROFILE_DESCRIPTION);
		const skillsInput = page.getByTestId('onboarding-skills').getByRole('combobox');
		await skillsInput.fill('TypeScript');
		await skillsInput.press('Enter');
		await skillsInput.fill('E2E');
		await skillsInput.press('Enter');
		await page.getByTestId('onboarding-profile-next').click();

		// Step 4: Recovery step (now comes after profile in new order)
		await page
			.getByTestId('onboarding-step-recovery')
			.waitFor({ state: 'visible', timeout: 30_000 });
		e2eLog('Step 4: Recovery step visible; skip → complete', stepLog);

		// Skip recovery by clicking next without filling in any fields
		await page.getByTestId('onboarding-recovery-next').click();

		// Step 5: Complete step (location step no longer exists)
		await page
			.getByTestId('onboarding-step-complete')
			.waitFor({ state: 'visible', timeout: 30_000 });
		e2eLog('Step 5: Complete step visible; go to dashboard', stepLog);

		// Go to dashboard — button is immediately visible (no loading state)
		await page.getByTestId('onboarding-go-to-dashboard').click();
		await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
		e2eLog('Step 6: Nostr user onboarding complete; dashboard', stepLog);
	});
});
