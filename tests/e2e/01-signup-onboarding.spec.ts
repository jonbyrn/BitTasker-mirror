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
import {
	writeNostrNsec,
	getCredentialSetLabels,
	readCredentialSet,
	USERNAME_DOMAIN_SUFFIX
} from './utils/webauthn-credentials';

function e2eLog(message: string, stepLog: string[]): void {
	const line = `[E2E] ${message}`;
	stepLog.push(line);

	console.log(line);
}

const E2E_PROFILE_DESCRIPTION =
	'E2E test user profile. Experienced in various professional domains including software development, testing, and automation. Ready to take on tasks and deliver quality work.';

/** Skip all tests in this file if required E2E env is missing (fail fast with clear message). */
function requireE2EEnv() {
	const bypass = process.env.VITE_E2E_TURNSTILE_BYPASS === 'true';
	const apiUrl = process.env.VITE_API_URL;
	if (!bypass || !apiUrl) {
		test.skip(
			true,
			`Requires VITE_E2E_TURNSTILE_BYPASS=true and VITE_API_URL. Got bypass=${!!bypass}, apiUrl=${!!apiUrl}.`
		);
	}
}

test.describe.serial('Signup and onboarding (create credentials file)', () => {
	test.beforeEach(() => {
		requireE2EEnv();
	});

	test('user 1: signup → full onboarding → dashboard', async ({
		page,
		passkeyAssertion,
		lastSignupUsernameStore
	}) => {
		// Long flow: signup → onboarding (username, passkey, recovery skip, profile, location, complete) → dashboard
		test.setTimeout(240_000);
		const ts = Date.now();
		const uniqueUsername = `e2e-${ts}`;
		lastSignupUsernameStore.value = uniqueUsername;
		passkeyAssertion.expectedUsername = uniqueUsername;
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

		const gotoOptions = { waitUntil: 'networkidle' as const };

		e2eLog('Step 1: goto /', stepLog);
		await page.goto('/', gotoOptions);
		await expect(page).toHaveURL(/\//);
		await expect(page.getByTestId('signup-link')).toBeVisible({ timeout: 20_000 });
		await page.getByTestId('signup-link').click();
		await page.waitForLoadState('domcontentloaded');
		await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 10_000 });
		const continueBtn = page.getByTestId('signup-continue');
		await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
		await continueBtn.click();
		// Retry: if still on signup after 5s (slow backend), click Continue again
		const onboardingStepTimeout = 45_000;
		let reachedOnboarding = await page
			.getByTestId('onboarding-step-username')
			.waitFor({ state: 'visible', timeout: 5_000 })
			.then(() => true)
			.catch(() => false);
		if (!reachedOnboarding && page.url().includes('/auth/signup')) {
			e2eLog('Step 3 retry: still on signup, clicking Continue again', stepLog);
			await page.getByTestId('signup-continue').click();
			reachedOnboarding = await page
				.getByTestId('onboarding-step-username')
				.waitFor({ state: 'visible', timeout: onboardingStepTimeout })
				.then(() => true)
				.catch(() => false);
		}
		if (!reachedOnboarding) {
			e2eLog(`Step 4 FAILED: onboarding not ready. URL=${page.url()}`, stepLog);
			await attachDiagnostics('signup-to-onboarding-failure');
			throw new Error(
				'Timeout waiting for onboarding. Set VITE_API_URL and ensure backend is running.'
			);
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
		// Professional title/description/skills are optional and only visible when "I want to get hired" is checked
		await page.getByTestId('onboarding-want-to-get-hired').check();
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

	test('username taken: duplicate username shows error', async ({
		page,
		lastSignupUsernameStore
	}) => {
		test.setTimeout(60_000);
		const taken = lastSignupUsernameStore.value;
		if (!taken) {
			test.skip(true, 'Requires user 1 to have run first (lastSignupUsernameStore)');
			return;
		}
		// Test 1 (user 1 credential in file): after user 1, signup set should exist with that username
		const signupCreds = readCredentialSet('signup');
		expect(signupCreds, 'user 1 teardown should have written signup credentials').not.toBeNull();
		expect(signupCreds!.length).toBeGreaterThan(0);
		expect(signupCreds![0].userName).toBe(taken + USERNAME_DOMAIN_SUFFIX);

		await page.goto('/auth/signup', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 10_000 });
		await expect(page.getByTestId('signup-continue')).toBeEnabled({ timeout: 10_000 });
		await page.getByTestId('signup-continue').click();
		await page
			.getByTestId('onboarding-step-username')
			.waitFor({ state: 'visible', timeout: 15_000 });
		await page.getByTestId('onboarding-username-input').fill(taken);
		await page.getByTestId('onboarding-username-next').click();
		await expect(page.getByTestId('onboarding-username-error')).toBeVisible({ timeout: 10_000 });
		await expect(page.getByTestId('onboarding-username-error')).toContainText(
			/username is already taken|already taken/i
		);

		// Test 3 (no passkey = no write): this test did not create a passkey, so file should be unchanged
		const signupCredsAfter = readCredentialSet('signup');
		expect(signupCredsAfter, 'signup set should still exist').not.toBeNull();
		expect(
			signupCredsAfter![0].userName,
			'username-taken run should not have overwritten signup credentials (no passkey created)'
		).toBe(taken + USERNAME_DOMAIN_SUFFIX);
	});

	test('5a. Onboarding: step 1 (Passkey) Back goes to step 0 (Username)', async ({
		page,
		passkeyAssertion
	}) => {
		test.setTimeout(90_000);
		const ts = Date.now();
		const uniqueUsername = `e2e-back-${ts}`;
		passkeyAssertion.expectedUsername = uniqueUsername;
		await page.goto('/', { waitUntil: 'networkidle' });
		await expect(page.getByTestId('signup-link')).toBeVisible({ timeout: 20_000 });
		await page.getByTestId('signup-link').click();
		await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 10_000 });
		await page.getByTestId('signup-continue').click();
		await page
			.getByTestId('onboarding-step-username')
			.waitFor({ state: 'visible', timeout: 45_000 });
		await page.getByTestId('onboarding-username-input').fill(uniqueUsername);
		await page.getByTestId('onboarding-username-next').click();
		await expect(page.getByTestId('passkey-setup-button')).toBeVisible({ timeout: 15_000 });
		// We are on step 1 (Passkey). Click Back → should show step 0 (Username).
		await page.getByRole('button', { name: /back|atrás/i }).click();
		await expect(page.getByTestId('onboarding-step-username')).toBeVisible({ timeout: 5_000 });
	});

	test('8a. Onboarding recovery: password mismatch shows error', async ({
		page,
		passkeyAssertion
	}) => {
		test.setTimeout(120_000);
		const ts = Date.now();
		const uniqueUsername = `e2e-pwm-${ts}`;
		passkeyAssertion.expectedUsername = uniqueUsername;
		await page.goto('/', { waitUntil: 'networkidle' });
		await page.getByTestId('signup-link').click();
		await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 10_000 });
		await page.getByTestId('signup-continue').click();
		await page
			.getByTestId('onboarding-step-username')
			.waitFor({ state: 'visible', timeout: 45_000 });
		await page.getByTestId('onboarding-username-input').fill(uniqueUsername);
		await page.getByTestId('onboarding-username-next').click();
		await expect(page.getByTestId('passkey-setup-button')).toBeVisible({ timeout: 15_000 });
		await page.getByTestId('passkey-setup-button').click();
		await page
			.getByTestId('onboarding-step-recovery')
			.waitFor({ state: 'visible', timeout: 60_000 });
		await page.getByTestId('onboarding-recovery-enable-checkbox').check();
		await page.getByTestId('onboarding-recovery-email').fill('e2e-mismatch@example.com');
		await page.getByTestId('onboarding-recovery-password').fill('ValidPass1!abc');
		await page.getByTestId('onboarding-recovery-confirm-password').fill('DifferentPass1!xyz');
		await page.getByTestId('onboarding-recovery-next').click();
		await expect(
			page.getByText(/passwords? don't match|passwords? mismatch|no coinciden|match/i)
		).toBeVisible({ timeout: 5_000 });
	});

	test('user 1 with recovery: signup → onboarding with recovery step filled → dashboard', async ({
		page,
		passkeyAssertion
	}) => {
		test.setTimeout(180_000);
		const ts = Date.now();
		const uniqueUsername = `e2e-rec-${ts}`;
		passkeyAssertion.expectedUsername = uniqueUsername;
		const displayName = uniqueUsername;
		const gotoOptions = { waitUntil: 'load' as const };

		await page.goto('/', gotoOptions);
		await page.getByTestId('signup-link').click();
		await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 10_000 });
		await expect(page.getByTestId('signup-continue')).toBeEnabled({ timeout: 10_000 });
		await page.getByTestId('signup-continue').click();
		await page
			.getByTestId('onboarding-step-username')
			.waitFor({ state: 'visible', timeout: 45_000 });
		await page.getByTestId('onboarding-username-input').fill(uniqueUsername);
		await page.getByTestId('onboarding-username-next').click();
		await expect(page.getByTestId('passkey-setup-button')).toBeVisible({ timeout: 15_000 });
		await page.getByTestId('passkey-setup-button').click();
		await page
			.getByTestId('onboarding-step-recovery')
			.waitFor({ state: 'visible', timeout: 60_000 });
		// Enable recovery, fill email (password is auto-generated when we check the box)
		await page.getByTestId('onboarding-recovery-enable-checkbox').check();
		await page.getByTestId('onboarding-recovery-email').fill('e2e-recovery@example.com');
		await page.getByTestId('onboarding-recovery-next').click();
		await page
			.getByTestId('onboarding-step-profile')
			.waitFor({ state: 'visible', timeout: 15_000 });
		await page.getByTestId('onboarding-display-name').fill(displayName);
		await page.getByTestId('onboarding-want-to-get-hired').check();
		await page.getByTestId('onboarding-professional-title').fill('E2E Recovery Professional');
		await page.getByTestId('onboarding-profile-description').fill(E2E_PROFILE_DESCRIPTION);
		const skillsInput = page.getByTestId('onboarding-skills').getByRole('combobox');
		await skillsInput.fill('Testing');
		await skillsInput.press('Enter');
		await page.getByTestId('onboarding-profile-next').click();
		await page
			.getByTestId('onboarding-step-location')
			.waitFor({ state: 'visible', timeout: 30_000 });
		await page.getByTestId('onboarding-location-next').click();
		await page
			.getByTestId('onboarding-step-complete')
			.waitFor({ state: 'visible', timeout: 30_000 });
		await page.getByTestId('onboarding-continue-without-completing').click();
		await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
	});

	// Title contains "Nostr" so fixture uses empty authenticator and writes label 'nostr'.
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
		writeNostrNsec(nsec);
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
		// Stabilize: longer timeout for backend + optional retry (submit again if still on login after first wait)
		const onboardingTimeout = 60_000;
		let onOnboarding = await page
			.waitForURL(/\/auth\/onboarding/, { timeout: onboardingTimeout })
			.catch(() => false);
		if (
			!onOnboarding &&
			(await page
				.getByTestId('login-submit')
				.isVisible()
				.catch(() => false))
		) {
			e2eLog('Step 2 retry: still on login, submitting nsec again', stepLog);
			await page.getByTestId('login-submit').click();
			onOnboarding = await page
				.waitForURL(/\/auth\/onboarding/, { timeout: onboardingTimeout })
				.catch(() => false);
		}
		if (!onOnboarding) {
			e2eLog(`Step 2 FAILED: did not reach onboarding. URL=${page.url()}`, stepLog);
			throw new Error(
				'Nostr login did not redirect to onboarding. Check VITE_API_URL and backend.'
			);
		}
		await page
			.getByTestId('onboarding-step-profile')
			.waitFor({ state: 'visible', timeout: 30_000 });
		e2eLog('Step 3: Profile step visible; fill and next', stepLog);
		await page.getByTestId('onboarding-display-name').fill(displayName);
		await page.getByTestId('onboarding-want-to-get-hired').check();
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

	// Test 7: credential file has both signup and nostr labels after full 01 run
	test('credential file has both signup and nostr labels after onboarding flows', async ({
		page
	}) => {
		const labels = getCredentialSetLabels();
		expect(labels, 'credential file should exist and have at least signup and nostr').toContain(
			'signup'
		);
		expect(labels).toContain('nostr');
		expect(readCredentialSet('signup')).not.toBeNull();
		expect(readCredentialSet('nostr')).not.toBeNull();
		// Minimal use of page so fixture teardown runs (no-op for this test)
		await page.goto('/auth/login', { waitUntil: 'load' }).catch(() => {});
	});
});
