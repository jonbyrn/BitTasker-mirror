import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';

test.describe('Dashboard profile routes', () => {
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
	test.use({ credentialLabel: 'signup' });

	test('loads /dashboard/profile', async ({ authenticatedPageCrossBrowser }) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard/profile', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/profile$/);
		await expect(page.locator('.mx-auto.h-full.max-w-6xl')).toBeVisible();
	});

	test('loads /dashboard/profile/edit and detects invalid profile input (website URL)', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard/profile/edit', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/profile\/edit$/);
		await expect(page.locator('#website')).toBeVisible();

		await page.locator('#website').fill('not-a-valid-url');
		await expect
			.poll(async () =>
				page.locator('#website').evaluate((el) => !((el as HTMLInputElement).checkValidity()))
			)
			.toBeTruthy();
	});

	test('saves profile edits and exits to /dashboard/profile', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard/profile/edit', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/profile\/edit$/);
		await page.locator('#website').fill(`https://example.com/e2e-${Date.now()}`);

		await page
			.getByRole('button')
			.filter({ hasText: /save|save_all_and_exit/i })
			.first()
			.click();

		await expect(page).toHaveURL(/\/dashboard\/profile$/, { timeout: 15_000 });
	});

	test('persists website value after save and page reload', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		const website = `https://example.com/profile-e2e-${Date.now()}`;

		await page.goto('/dashboard/profile/edit', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/profile\/edit$/);
		await page.locator('#website').fill(website);

		await page
			.getByRole('button')
			.filter({ hasText: /save|save_all_and_exit/i })
			.first()
			.click();
		await expect(page).toHaveURL(/\/dashboard\/profile$/, { timeout: 15_000 });

		await page.goto('/dashboard/profile/edit', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/profile\/edit$/);
		await expect
			.poll(async () => (await page.locator('#website').inputValue()).trim(), { timeout: 20_000 })
			.toMatch(/^https?:\/\/.+/);
	});
});
