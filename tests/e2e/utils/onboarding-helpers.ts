import { expect, type Page } from '@playwright/test';

export const WEBAUTHN_CHROMIUM_ONLY_MESSAGE =
	'WebAuthn E2E uses Chromium CDP virtual authenticators; run this spec with --project=chromium.';

export const E2E_PROFILE_DESCRIPTION =
	'E2E test user profile. Experienced in various professional domains including software development, testing, and automation. Ready to take on tasks and deliver quality work.';

type SignupOnboardingOptions = {
	uniqueUsername?: string;
	displayName?: string;
	professionalTitle?: string;
	skills?: string[];
	profileDescription?: string;
};

export async function dismissBetaWarningIfPresent(page: Page): Promise<void> {
	await page
		.getByRole('button', {
			name: 'I understand',
			exact: true
		})
		.click({ timeout: 5_000 })
		.catch(() => {});
}

export async function completeSignupOnboarding(
	page: Page,
	options: SignupOnboardingOptions = {}
): Promise<{ uniqueUsername: string; displayName: string }> {
	const timestamp = Date.now();
	const uniqueUsername = options.uniqueUsername ?? `e2e-${timestamp}`;
	const displayName = options.displayName ?? uniqueUsername;
	const professionalTitle = options.professionalTitle ?? 'E2E Test Professional';
	const skills = options.skills ?? ['JavaScript', 'Testing'];
	const profileDescription = options.profileDescription ?? E2E_PROFILE_DESCRIPTION;

	await page.goto('/', { waitUntil: 'load' });
	await expect(page).toHaveURL(/\//);

	await page.getByTestId('signup-link').click();
	await page.waitForLoadState('domcontentloaded');
	await expect(page).toHaveURL(/\/auth\/signup/, { timeout: 10_000 });

	const continueButton = page.getByTestId('signup-continue');
	await expect(continueButton).toBeEnabled({ timeout: 10_000 });
	await continueButton.click();

	await page.getByTestId('onboarding-step-username').waitFor({
		state: 'visible',
		timeout: 45_000
	});
	await expect(page).toHaveURL(/\/auth\/onboarding/);

	await page.getByTestId('onboarding-username-input').fill(uniqueUsername);
	await page.getByTestId('onboarding-username-next').click();

	const passkeySetupButton = page.getByTestId('passkey-setup-button');
	await expect(passkeySetupButton).toBeVisible({ timeout: 15_000 });
	await passkeySetupButton.click();

	const recoveryStep = page.getByTestId('onboarding-step-recovery');
	const passkeyError = page.getByTestId('passkey-setup-error');
	const passkeyOutcome = await Promise.race([
		recoveryStep.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'recovery' as const),
		passkeyError.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'error' as const)
	]).catch(() => null);

	if (passkeyOutcome === 'error') {
		const errorText = (await passkeyError.textContent().catch(() => ''))?.trim();
		throw new Error(
			`Passkey setup failed. Ensure VITE_API_URL is set and backend is running. Error: ${(errorText || '').slice(0, 200)}`
		);
	}

	if (passkeyOutcome !== 'recovery') {
		throw new Error(
			'Timeout waiting for Recovery step. Set VITE_API_URL to your dev backend and ensure it is running.'
		);
	}

	await page.getByTestId('onboarding-recovery-next').click();
	await page.getByTestId('onboarding-step-profile').waitFor({
		state: 'visible',
		timeout: 15_000
	});

	await page.getByTestId('onboarding-display-name').fill(displayName);
	await page.getByTestId('onboarding-professional-title').fill(professionalTitle);
	await page.getByTestId('onboarding-profile-description').fill(profileDescription);

	const skillsInput = page.getByTestId('onboarding-skills').getByRole('combobox');
	for (const skill of skills) {
		await skillsInput.fill(skill);
		await skillsInput.press('Enter');
	}

	await page.getByTestId('onboarding-profile-next').click();
	await page.getByTestId('onboarding-step-location').waitFor({
		state: 'visible',
		timeout: 30_000
	});

	await page.getByTestId('onboarding-location-next').click();
	await page.getByTestId('onboarding-step-complete').waitFor({
		state: 'visible',
		timeout: 30_000
	});

	await page.getByTestId('onboarding-continue-without-completing').click();
	await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });
	await dismissBetaWarningIfPresent(page);

	return { uniqueUsername, displayName };
}
