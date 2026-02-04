import { test, expect } from '@playwright/test';

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
	test('from root: signup → bypass Turnstile → enter username → reach Set up passkey step', async ({
		page
	}) => {
		const takeScreenshots = process.env.E2E_SCREENSHOTS === '1';
		const uniqueUsername = `e2e-${Date.now()}`;

		// 1. Open root page
		await page.goto('/');
		await expect(page).toHaveURL(/\//);
		if (takeScreenshots) await page.screenshot({ path: 'test-results/01-root.png' });

		// 2. Click signup (hero CTA)
		const signupLink = page.getByTestId('signup-link');
		await expect(signupLink).toBeVisible({ timeout: 15_000 });
		await signupLink.click();

		// 3. Signup page → Continue (bypass)
		await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 10_000 });
		if (takeScreenshots) await page.screenshot({ path: 'test-results/02-signup-page.png' });
		const continueBtn = page.getByTestId('signup-continue');
		await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
		await continueBtn.click();

		// 4. Onboarding username step: fill unique username and submit (calls dev backend for availability)
		await expect(page).toHaveURL(/\/auth\/onboarding/, { timeout: 10_000 });
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
