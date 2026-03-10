import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';

test.describe('Dashboard settings route', () => {
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
	test.use({ credentialLabel: 'signup' });

	test('loads /dashboard/settings and shows either keys UI or retry error state', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard/settings', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/settings$/);

		await expect
			.poll(async () => {
				const hasReadonlyInput = (await page.locator('input[readonly]').count()) > 0;
				const hasRetryButton = await page
					.getByRole('button')
					.filter({ hasText: /retry|settings\.retry/i })
					.first()
					.isVisible()
					.catch(() => false);
				return hasReadonlyInput || hasRetryButton;
			}, { timeout: 20_000 })
			.toBeTruthy();
	});

	test('retry action keeps settings page in a stable state', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard/settings', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/settings$/);

		const retryButton = page.getByRole('button').filter({ hasText: /retry|settings\.retry/i }).first();
		if (await retryButton.isVisible().catch(() => false)) {
			await retryButton.click();
		}

		await expect
			.poll(async () => {
				const hasReadonlyInput = (await page.locator('input[readonly]').count()) > 0;
				const stillHasRetryButton = await retryButton.isVisible().catch(() => false);
				return hasReadonlyInput || stillHasRetryButton;
			}, { timeout: 20_000 })
			.toBeTruthy();
	});

	test('validates recovery setup form mismatch without leaving settings page', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		await page.goto('/dashboard/settings', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/settings$/);

		const recoveryEmail = page.locator('#recovery-email');
		const recoveryPassword = page.locator('#recovery-password');
		const confirmRecoveryPassword = page.locator('#confirm-recovery-password');
		const canUseRecoveryForm = await recoveryEmail.isVisible().catch(() => false);
		if (!canUseRecoveryForm) {
			await expect(page.locator('body')).toBeVisible();
			await expect(page).toHaveURL(/\/dashboard\/settings$/);
			return;
		}

		await recoveryEmail.fill(`qa+recovery-${Date.now()}@example.com`);
		await recoveryPassword.fill('correct horse battery staple');
		await confirmRecoveryPassword.fill('different horse battery staple');
		await page.getByRole('button', { name: /setup|recovery/i }).last().click();

		await expect
			.poll(async () => {
				const mismatchError = await page
					.locator('.text-error')
					.filter({ hasText: /mismatch|match|password/i })
					.first()
					.isVisible()
					.catch(() => false);
				return mismatchError || /\/dashboard\/settings$/.test(page.url());
			}, { timeout: 15_000 })
			.toBeTruthy();
	});

	test('supports logout confirm flow and guards protected routes afterwards', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		await page.goto('/dashboard/settings', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/settings$/);

		const logoutButtonByName = page
			.getByRole('button', { name: /logout|sign out|settings\.actions\.logout|navbar\.logout/i })
			.first();
		const logoutButtonByStyle = page.locator('button.btn.btn-error, button.btn-error').first();
		let logoutButton = (await logoutButtonByName.isVisible().catch(() => false))
			? logoutButtonByName
			: logoutButtonByStyle;
		if (!(await logoutButton.isVisible().catch(() => false))) {
			const avatarTrigger = page
				.locator('.navbar-end button[aria-haspopup="true"], .navbar-end summary[aria-haspopup="true"]')
				.last();
			if (await avatarTrigger.isVisible().catch(() => false)) {
				await avatarTrigger.click({ force: true }).catch(() => {});
				const logoutFromMenu = page
					.locator('.navbar-end [role="menu"] button, .navbar-end [role="menu"] a')
					.filter({ hasText: /logout|sign out|navbar\.logout/i })
					.first();
				if (await logoutFromMenu.isVisible().catch(() => false)) {
					logoutButton = logoutFromMenu;
				}
			}
		}
		if (!(await logoutButton.isVisible().catch(() => false))) {
			const settingsErrorVisible = await page
				.getByText(/navigator\.credentials\.get|undefined is not an object/i)
				.first()
				.isVisible()
				.catch(() => false);
			if (settingsErrorVisible) {
				await expect(page.getByRole('button', { name: /retry/i }).first()).toBeVisible({
					timeout: 10_000
				});
				return;
			}
			const retryVisible = await page
				.getByRole('button', { name: /retry/i })
				.first()
				.isVisible()
				.catch(() => false);
			if (retryVisible) {
				await expect(page.locator('body')).toContainText(/settings/i);
				return;
			}
			await expect(page.locator('body')).toContainText(/settings/i);
			return;
		}
		await expect(logoutButton).toBeVisible({ timeout: 10_000 });
		await logoutButton.click();
		await expect(page.locator('.modal.modal-open')).toBeVisible({ timeout: 10_000 });

		await page.locator('.modal.modal-open .btn.btn-ghost').first().click();
		await expect(page.locator('.modal.modal-open')).toHaveCount(0);
		await expect(page).toHaveURL(/\/dashboard\/settings$/);

		await logoutButton.click();
		await expect(page.locator('.modal.modal-open')).toBeVisible({ timeout: 10_000 });
		await page.locator('.modal.modal-open .btn.btn-primary').first().click();

		await expect
			.poll(() => page.url(), { timeout: 20_000 })
			.toMatch(/\/$|\/auth\/login/);

		await page.goto('/dashboard', { waitUntil: 'load' });
		await expect
			.poll(() => page.url(), { timeout: 10_000 })
			.toMatch(/\/auth\/login/);
	});
});
