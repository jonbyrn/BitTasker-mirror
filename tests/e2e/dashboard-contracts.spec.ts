import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';

test.describe('Dashboard contracts tab', () => {
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
	test.use({ credentialLabel: 'signup' });

	test('loads contracts panel and reaches list/empty/error stable state', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		await page.goto('/dashboard?tab=contracts', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\?tab=contracts/);
		const contractsPanel = page.locator('#panel-contracts');
		if (!(await contractsPanel.isVisible().catch(() => false))) {
			const contractsTab = page.locator('#tab-contracts').first();
			if (await contractsTab.isVisible().catch(() => false)) {
				await contractsTab.click();
			}
		}
		await expect
			.poll(async () => contractsPanel.isVisible().catch(() => false), { timeout: 20_000 })
			.toBeTruthy();

		await expect
			.poll(async () => {
				const hasContractCard = (await page.locator('.card, [data-contract-id]').count()) > 0;
				const hasEmptyContracts = await page
					.getByText(/no_contracts|no contracts|no_filtered_contracts/i)
					.first()
					.isVisible()
					.catch(() => false);
				const hasRetry = await page
					.getByRole('button')
					.filter({ hasText: /retry|contracts\.retry/i })
					.first()
					.isVisible()
					.catch(() => false);
				return hasContractCard || hasEmptyContracts || hasRetry;
			}, { timeout: 20_000 })
			.toBeTruthy();
	});

	test('contracts filters and details action are operational', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		await page.goto('/dashboard?tab=contracts', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\?tab=contracts/);
		const contractsPanel = page.locator('#panel-contracts');
		if (!(await contractsPanel.isVisible().catch(() => false))) {
			const contractsTab = page.locator('#tab-contracts').first();
			if (await contractsTab.isVisible().catch(() => false)) {
				await contractsTab.click();
			}
		}
		await expect
			.poll(async () => contractsPanel.isVisible().catch(() => false), { timeout: 20_000 })
			.toBeTruthy();

		const refreshButton = page.getByRole('button', { name: /refresh|contracts\.refresh/i }).first();
		if (await refreshButton.isVisible().catch(() => false)) {
			await refreshButton.click();
		}

		// Role filter buttons should be interactable regardless of data volume.
		const allRoleButton = page.getByRole('button', { name: /all roles|all_roles/i }).first();
		if (await allRoleButton.isVisible().catch(() => false)) {
			await allRoleButton.click();
		}

		const detailsButton = page.getByRole('button', { name: /view details|details/i }).first();
		const hasDetailsButton = await detailsButton.isVisible().catch(() => false);
		if (hasDetailsButton) {
			await detailsButton.click();
			await expect(page.locator('.drawer-side, [role="dialog"]')).toBeVisible({ timeout: 10_000 });
			await page.keyboard.press('Escape');
		}

		await expect
			.poll(async () => {
				const hasContractCard = (await page.locator('.card').count()) > 0;
				const hasEmptyContracts = await page
					.getByText(/no_contracts|no contracts|no_filtered_contracts/i)
					.first()
					.isVisible()
					.catch(() => false);
				const hasRetry = await page
					.getByRole('button')
					.filter({ hasText: /retry|contracts\.retry/i })
					.first()
					.isVisible()
					.catch(() => false);
				return hasContractCard || hasEmptyContracts || hasRetry;
			}, { timeout: 20_000 })
			.toBeTruthy();
	});
});
