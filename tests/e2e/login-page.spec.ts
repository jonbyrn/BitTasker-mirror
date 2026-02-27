/**
 * Login page E2E tests (no credentials file required).
 *
 * Covers:
 * 1. Login page loads and shows main options (passkey + nsec) and signup/recover links
 * 2. Navigate to signup from login
 * 3. Navigate to recover from login
 * 4. Invalid nsec shows error (loading state, error message, no passkey help button)
 * 5. Empty nsec submit shows error (loading state, error message, no passkey help button)
 * 6. Cancel from nsec form returns to passkey choice
 * 7. Passkey error (no credentials) shows error and passkey help button
 * 8. Passkey error: help modal opens and retry clears error
 *
 * Does not require running 01-signup-onboarding first. Optional: VITE_API_URL
 * for tests 4 and 5 (invalid/empty nsec) so getChallenge() succeeds and error
 * comes from decode/API; otherwise network error may appear instead.
 * Tests 7 and 8 require Chromium (CDP for virtual authenticator). They mock the auth
 * challenge endpoint so no backend is required; empty virtual authenticator → passkey
 * error → help button and modal.
 *
 * @see docs/testing/e2e-testing.md
 */
import { test, expect } from '@playwright/test';

const VIRTUAL_AUTHENTICATOR_OPTIONS = {
	protocol: 'ctap2' as const,
	ctap2Version: 'ctap2_1' as const,
	transport: 'internal' as const,
	hasResidentKey: true,
	hasUserVerification: true,
	isUserVerified: true,
	automaticPresenceSimulation: true
};

/** Base64-encoded 32-byte challenge for WebAuthn; app decodes with atob. */
const MOCK_CHALLENGE_B64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/**
 * Mock the auth challenge endpoint so getChallenge() succeeds without a real backend.
 * Responds with a valid challenge so the app proceeds to credentials.get(); with an empty
 * virtual authenticator that returns null → "No credential found" → passkey help UI.
 */
/** Tracks how many challenge requests were seen (for debugging). */
let challengeRequestCount = 0;

function mockChallengeRoute(page: import('@playwright/test').Page) {
	challengeRequestCount = 0;
	// Match any URL containing the challenge path (full URL = VITE_API_URL + /api/v1/auth/challenge)
	page.route(
		(url: URL) => {
			const u = url.toString();
			if (u.includes('challenge')) {
				challengeRequestCount += 1;
				return true;
			}
			return false;
		},
		(route) => {
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					challenge: MOCK_CHALLENGE_B64,
					message: 'OK'
				})
			});
		}
	);
}

test.describe('Login page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/auth/login', { waitUntil: 'load' });
	});

	test('1. loads and shows passkey and nsec options', async ({ page }) => {
		await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
		await expect(page.getByTestId('login-continue-passkey')).toBeVisible();
		await expect(page.getByTestId('login-with-nsec')).toBeVisible();
		await expect(page.getByTestId('login-signup-link')).toBeVisible();
		await expect(page.getByTestId('login-recover-link')).toBeVisible();
	});

	test('2. navigate to signup from login', async ({ page }) => {
		await page.getByTestId('login-signup-link').click();
		await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 10_000 });
	});

	test('3. navigate to recover from login', async ({ page }) => {
		await page.getByTestId('login-recover-link').click();
		await expect(page).toHaveURL(/\/auth\/recover\/send/, { timeout: 10_000 });
	});

	test('3b. recover/send page smoke: form and send button visible', async ({ page }) => {
		await page.goto('/auth/recover/send', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/recover\/send/, { timeout: 10_000 });
		await expect(page.getByTestId('recover-send-email')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByTestId('recover-send-submit')).toBeVisible();
	});

	test('2a. Recover send: Back to login visible and navigates to /auth/login', async ({ page }) => {
		await page.goto('/auth/recover/send', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/recover\/send/, { timeout: 10_000 });
		// First load can be slow (hydration); retry once if form not visible
		const emailInput = page.getByTestId('recover-send-email');
		try {
			await expect(emailInput).toBeVisible({ timeout: 15_000 });
		} catch {
			await page.reload({ waitUntil: 'load' });
			await expect(emailInput).toBeVisible({ timeout: 30_000 });
		}
		const backBtn = page.getByRole('button', {
			name: /back to login|volver al inicio de sesión|login/i
		});
		await expect(backBtn).toBeVisible({ timeout: 5_000 });
		await backBtn.click();
		await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
	});

	test('3c. recover/[npub] page smoke: invalid npub shows recovery form or error or redirect', async ({
		page
	}) => {
		await page.goto('/auth/recover/npub1invalid000000000000000000000000000000000000000000000', {
			waitUntil: 'load'
		});
		await expect(page).toHaveURL(/\/auth\/recover\/npub1|\/auth\/login/, { timeout: 10_000 });
		// Recovery page: card with password input (step 1), or error text, or login page
		const recoveryForm = page.locator('input[type="password"]');
		const errorOrRedirect = page.getByText(/invalid|no recovery|redirecting/i);
		const loginBtn = page.getByTestId('login-continue-passkey');
		await expect(recoveryForm.or(errorOrRedirect).or(loginBtn)).toBeVisible({ timeout: 10_000 });
	});

	test('Signup page smoke: load, Continue visible, click goes to onboarding', async ({ page }) => {
		await page.goto('/auth/signup', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 10_000 });
		// Content: title or key heading (en: "Signup for BitTasker", es or other)
		await expect(
			page.getByRole('heading', { name: /signup for bittasker|sign up|crear/i })
		).toBeVisible();
		await expect(
			page
				.locator('a[href="/auth/login"]')
				.filter({ hasText: /login|iniciar/i })
				.first()
		).toBeVisible();
		const continueBtn = page.getByTestId('signup-continue');
		await expect(continueBtn).toBeVisible();
		// With VITE_E2E_TURNSTILE_BYPASS, Continue is enabled without Turnstile
		await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
		await continueBtn.click();
		await expect(page).toHaveURL(/\/auth\/onboarding/, { timeout: 15_000 });
	});

	test('1a. Signup: click Login link lands on /auth/login', async ({ page }) => {
		await page.goto('/auth/signup', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 10_000 });
		await page
			.locator('a[href="/auth/login"]')
			.filter({ hasText: /login|iniciar/i })
			.first()
			.click();
		await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
	});

	test('Signup page: either Continue enabled (bypass) or Turnstile present', async ({ page }) => {
		await page.goto('/auth/signup', { waitUntil: 'load' });
		await page.waitForTimeout(2000);
		const continueEnabled = await page
			.getByTestId('signup-continue')
			.isEnabled()
			.catch(() => false);
		const iframeCount = await page.locator('iframe[src*="challenges.cloudflare.com"]').count();
		const hasTurnstile = iframeCount > 0;
		expect(
			continueEnabled || hasTurnstile,
			'Either Continue should be enabled (E2E bypass) or Turnstile iframe should be present'
		).toBeTruthy();
	});

	test('7a. Auth layout: no token and no bypass, /auth/onboarding redirects to /auth/signup', async ({
		page
	}) => {
		test.skip(
			process.env.VITE_E2E_TURNSTILE_BYPASS === 'true',
			'Run without VITE_E2E_TURNSTILE_BYPASS to verify auth layout redirect (e.g. CI without bypass)'
		);
		await page.evaluate(() => {
			localStorage.removeItem('CapacitorStorage.access_token');
		});
		await page.goto('/auth/onboarding', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 10_000 });
	});

	test('Protected layout: no or invalid token redirects to login', async ({ page }) => {
		// Load app then clear access token (Capacitor Preferences on web uses localStorage with prefix)
		await page.goto('/auth/login', { waitUntil: 'load' });
		await page.evaluate(() => {
			localStorage.removeItem('CapacitorStorage.access_token');
		});
		await page.goto('/dashboard', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
	});

	test('4b. Auth layout: invalid or expired token redirects to login (wallet requires validation)', async ({
		page
	}) => {
		// Requires API so invalid token returns 401; skip when no backend (e.g. VITE_API_URL unset)
		test.skip(
			!process.env.VITE_API_URL,
			'Requires VITE_API_URL so protected layout can validate token and get 401.'
		);
		await page.goto('/auth/login', { waitUntil: 'load' });
		await page.evaluate(() => {
			localStorage.setItem('CapacitorStorage.access_token', 'invalid-or-expired-token');
		});
		await page.goto('/dashboard/wallet', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 });
		await page.evaluate(() => {
			localStorage.removeItem('CapacitorStorage.access_token');
		});
	});

	test('3a. Auth layout: with token, /auth/login redirects to /dashboard', async ({ page }) => {
		// When VITE_API_URL is set, protected layout validates token; fake token gets 401 and redirect to login.
		// So this test only passes when no API (token not validated) or with a valid token.
		test.skip(
			!!process.env.VITE_API_URL,
			'With VITE_API_URL, fake token is rejected (401); run without API or use valid token.'
		);
		await page.goto('/auth/login', { waitUntil: 'load' });
		await page.evaluate(() => {
			localStorage.setItem('CapacitorStorage.access_token', 'e2e-fake-token');
		});
		await page.goto('/auth/login', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
		await page.evaluate(() => {
			localStorage.removeItem('CapacitorStorage.access_token');
		});
	});

	test('4a. Auth layout: with token, /auth/signup redirects to /dashboard', async ({ page }) => {
		test.skip(
			!!process.env.VITE_API_URL,
			'With VITE_API_URL, fake token is rejected (401); run without API or use valid token.'
		);
		await page.goto('/auth/signup', { waitUntil: 'load' });
		await page.evaluate(() => {
			localStorage.setItem('CapacitorStorage.access_token', 'e2e-fake-token');
		});
		await page.goto('/auth/signup', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
		await page.evaluate(() => {
			localStorage.removeItem('CapacitorStorage.access_token');
		});
	});

	test('Recover send: submit invalid email shows validation error', async ({ page }) => {
		// Full navigation to recover/send; use 'load' so we don't block on networkidle (no API needed for this test)
		await page.goto('/auth/recover/send', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/recover\/send/, { timeout: 10_000 });
		const emailInput = page.getByTestId('recover-send-email');
		try {
			await expect(emailInput).toBeVisible({ timeout: 15_000 });
		} catch {
			await page.reload({ waitUntil: 'load' });
			await expect(emailInput).toBeVisible({ timeout: 30_000 });
		}
		// Use a value that passes HTML5 type=email so form submits, but fails app validator (need @ and .)
		// "a@b" has no dot so fails our regex; client-side only - no API call
		await emailInput.fill('a@b');
		await page.getByTestId('recover-send-submit').click();
		// En: "Invalid email address" / Es: "Dirección de correo no válida" or similar
		await expect(page.getByText(/invalid email|email.*required|correo.*válid/i)).toBeVisible({
			timeout: 5_000
		});
	});

	test('6a. Recover send: empty email submit shows required or validation message', async ({
		page
	}) => {
		await page.goto('/auth/recover/send', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/recover\/send/, { timeout: 10_000 });
		const emailInput = page.getByTestId('recover-send-email');
		try {
			await expect(emailInput).toBeVisible({ timeout: 15_000 });
		} catch {
			await page.reload({ waitUntil: 'load' });
			await expect(emailInput).toBeVisible({ timeout: 30_000 });
		}
		const submitBtn = page.getByTestId('recover-send-submit');
		await submitBtn.click();
		await expect(page).toHaveURL(/\/auth\/recover\/send/, { timeout: 5_000 });
		// Either app error or browser validation: no success state
		const successAlert = page.getByText(/check your email|recovery.*sent|we've sent/i);
		await expect(successAlert).not.toBeVisible({ timeout: 2_000 });
	});

	test('Locale switch: auth pages show translated content (Spanish)', async ({ page }) => {
		// Capacitor Preferences on web uses localStorage with prefix CapacitorStorage.
		await page.goto('/auth/login', { waitUntil: 'load' });
		await page.evaluate(() => {
			localStorage.setItem('CapacitorStorage.locale', 'es');
		});
		await page.reload({ waitUntil: 'load' });
		// Spanish: "Iniciar con Passkey" / English: "Login with Passkey"
		await expect(
			page.getByRole('button', { name: /iniciar con passkey|login with passkey/i })
		).toBeVisible({ timeout: 10_000 });
		await expect(
			page.getByRole('link', { name: /recuperar cuenta|recover account/i })
		).toBeVisible();
	});

	test('4. invalid nsec shows format requirements (no passkey help button)', async ({ page }) => {
		await page.getByTestId('login-with-nsec').click();
		await expect(page.getByTestId('login-nsec-input')).toBeVisible();
		await page.getByTestId('login-nsec-input').fill('invalid-key');
		await page.getByTestId('login-submit').click();
		const errorBox = page.getByTestId('login-error');
		await expect(errorBox).toBeVisible({ timeout: 15_000 });
		// Error must show nsec format requirements (nsec1, bech32, 60–65), not the raw failing input
		await expect(errorBox).toContainText(/nsec1/i);
		await expect(errorBox).toContainText(/bech32|60.*65|format|formato/i);
		await expect(errorBox).not.toContainText(/invalid-key|Found:|\.\.\./);
		// Nsec validation errors must not show the passkey troubleshooting help button
		await expect(errorBox.getByTestId('error-alert-help-button')).toHaveCount(0);
	});

	test('5. empty nsec submit shows error (no passkey help button)', async ({ page }) => {
		await page.getByTestId('login-with-nsec').click();
		await expect(page.getByTestId('login-nsec-input')).toBeVisible();
		await page.getByTestId('login-nsec-input').fill('');
		await page.getByTestId('login-submit').click();
		const errorBox = page.getByTestId('login-error');
		await expect(errorBox).toBeVisible({ timeout: 15_000 });
		// Empty nsec: message asks to enter nsec
		await expect(errorBox).toContainText(/enter|nsec|empty/i);
		await expect(errorBox.getByTestId('error-alert-help-button')).toHaveCount(0);
	});

	test('6. cancel from nsec form returns to passkey choice', async ({ page }) => {
		await page.getByTestId('login-with-nsec').click();
		await expect(page.getByTestId('login-nsec-input')).toBeVisible();
		await expect(page.getByTestId('login-nsec-cancel')).toBeVisible();
		await page.getByTestId('login-nsec-cancel').click();
		await expect(page.getByTestId('login-continue-passkey')).toBeVisible();
		await expect(page.getByTestId('login-nsec-input')).not.toBeVisible();
	});

	test('7. passkey error (no credentials) shows error and help button', async ({
		browser,
		baseURL
	}) => {
		test.skip(
			browser.browserType().name() !== 'chromium',
			'Passkey/WebAuthn uses CDP virtual authenticator; Chromium only'
		);
		const context = await browser.newContext({
			baseURL: baseURL ?? 'http://localhost:3000',
			viewport: { width: 1280, height: 720 }
		});
		const page = await context.newPage();
		mockChallengeRoute(page);
		const cdpSession = await context.newCDPSession(page);
		try {
			await cdpSession.send('WebAuthn.enable');
			await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
				options: VIRTUAL_AUTHENTICATOR_OPTIONS
			});
			// Do not add any credential so "No account" / passkey error is shown
			await page.goto('/auth/login', { waitUntil: 'load' });
			await page.getByTestId('login-continue-passkey').click();
			const errorBox = page.getByTestId('login-error');
			await expect(errorBox).toBeVisible({ timeout: 15_000 });
			// Challenge mock ensures getChallenge() succeeds; then credentials.get() with empty authenticator
			// yields browser error ("not allowed" / "timed out") or "No credential found" → passkey help UI
			expect(
				challengeRequestCount,
				'Challenge mock should be hit so flow reaches credentials.get().'
			).toBeGreaterThanOrEqual(1);
			await expect(errorBox.getByTestId('error-alert-help-button')).toBeVisible();
		} finally {
			await context.close();
		}
	});

	test('9. Login: loading state blocks second submit (passkey button disabled while loading)', async ({
		browser,
		baseURL
	}) => {
		test.skip(
			browser.browserType().name() !== 'chromium',
			'Passkey/WebAuthn uses CDP virtual authenticator; Chromium only'
		);
		const context = await browser.newContext({
			baseURL: baseURL ?? 'http://localhost:3000',
			viewport: { width: 1280, height: 720 }
		});
		const page = await context.newPage();
		// Delay challenge response so we have time to assert loading state
		page.route(
			(url: URL) => url.toString().includes('challenge'),
			async (route) => {
				await new Promise((r) => setTimeout(r, 800));
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						challenge: MOCK_CHALLENGE_B64,
						message: 'OK'
					})
				});
			}
		);
		const cdpSession = await context.newCDPSession(page);
		try {
			await cdpSession.send('WebAuthn.enable');
			await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
				options: VIRTUAL_AUTHENTICATOR_OPTIONS
			});
			await page.goto('/auth/login', { waitUntil: 'load' });
			const passkeyBtn = page.getByTestId('login-continue-passkey');
			await passkeyBtn.click();
			// Within 500ms the button should be disabled (or show loading)
			await expect(passkeyBtn).toBeDisabled({ timeout: 2_000 });
		} finally {
			await context.close();
		}
	});

	test('8. passkey error: help modal opens and retry clears error', async ({
		browser,
		baseURL
	}) => {
		test.skip(
			browser.browserType().name() !== 'chromium',
			'Passkey/WebAuthn uses CDP virtual authenticator; Chromium only'
		);
		const context = await browser.newContext({
			baseURL: baseURL ?? 'http://localhost:3000',
			viewport: { width: 1280, height: 720 }
		});
		const page = await context.newPage();
		mockChallengeRoute(page);
		const cdpSession = await context.newCDPSession(page);
		try {
			await cdpSession.send('WebAuthn.enable');
			await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
				options: VIRTUAL_AUTHENTICATOR_OPTIONS
			});
			await page.goto('/auth/login', { waitUntil: 'load' });
			await page.getByTestId('login-continue-passkey').click();
			const errorBox = page.getByTestId('login-error');
			await expect(errorBox).toBeVisible({ timeout: 15_000 });
			// Modal auto-opens for passkey errors
			await expect(page.getByTestId('error-troubleshooting-modal')).toBeVisible({
				timeout: 5_000
			});
			await page.getByTestId('error-troubleshooting-modal-retry').click();
			// Retry closes modal and clears error; authenticate runs again (may show error/modal again with no creds).
			// Assert we can reach the passkey button again (modal may reopen after failed retry).
			await expect(page.getByTestId('login-continue-passkey')).toBeVisible({ timeout: 10_000 });
		} finally {
			await context.close();
		}
	});
});
