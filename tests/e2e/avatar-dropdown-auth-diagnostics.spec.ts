import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-from-file';

test.describe('Authenticated avatar dropdown diagnostics', () => {
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
	test.use({ credentialLabel: 'signup' });

	const avatarTrigger = (page: import('@playwright/test').Page) =>
		page.locator('.navbar-end .dropdown.dropdown-end > button[aria-haspopup="true"]').first();

	const avatarDropdownMenu = (page: import('@playwright/test').Page) =>
		page.locator('.navbar-end .dropdown.dropdown-end [role="menu"]').first();

	const openAvatarDropdown = async (page: import('@playwright/test').Page) => {
		const trigger = avatarTrigger(page);
		await expect(trigger).toBeVisible({ timeout: 15_000 });
		await trigger.click();
		await expect(avatarDropdownMenu(page)).toBeVisible();
	};

	test('opens avatar dropdown from /dashboard topbar', async ({ authenticatedPageFromPasskeyFile }) => {
		const page = authenticatedPageFromPasskeyFile;

		await page.goto('/dashboard', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard/);

		await openAvatarDropdown(page);
	});

	test('closes avatar dropdown when tapping outside', async ({ authenticatedPageFromPasskeyFile }) => {
		const page = authenticatedPageFromPasskeyFile;

		await page.goto('/dashboard', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard/);

		await openAvatarDropdown(page);
		await page.mouse.click(5, 5);
		await expect(avatarDropdownMenu(page)).toHaveCount(0);
	});

	test('navigates from avatar dropdown using a stable menu link', async ({
		authenticatedPageFromPasskeyFile
	}) => {
		const page = authenticatedPageFromPasskeyFile;

		await page.goto('/dashboard', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard/);

		await openAvatarDropdown(page);

		const profileLink = avatarDropdownMenu(page).locator('a[href="/dashboard/profile"]').first();
		if (await profileLink.isVisible().catch(() => false)) {
			await profileLink.click();
			await expect(page).toHaveURL(/\/dashboard\/profile$/, { timeout: 15_000 });
			return;
		}

		const settingsLink = avatarDropdownMenu(page).locator('a[href="/dashboard/settings"]').first();
		await expect(settingsLink).toBeVisible({ timeout: 10_000 });
		await settingsLink.click();
		await expect(page).toHaveURL(/\/dashboard\/settings$/, { timeout: 15_000 });
	});
});
