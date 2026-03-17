import { expect, test, type Page } from '@playwright/test';

async function mockStableContractsVisualDependencies(page: Page) {
	await page.route('https://api.coinbase.com/**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				data: {
					amount: '50000.00'
				}
			})
		});
	});
}

async function disableVisualMotion(page: Page) {
	await page.addStyleTag({
		content: `
			*,
			*::before,
			*::after {
				animation: none !important;
				transition: none !important;
				caret-color: transparent !important;
			}
		`
	});
}

test.describe('service quote visual snapshots', () => {
	test.use({ viewport: { width: 1440, height: 1400 } });

	test.skip(({ browserName }) => browserName !== 'chromium', 'Visual baselines are pinned on Chromium.');

	test('matches the highlighted shared service contract drawer', async ({ page }) => {
		await mockStableContractsVisualDependencies(page);
		await page.goto('/e2e/service-harness.html?case=contracts-surface-highlighted-service');
		await disableVisualMotion(page);

		const harnessSurface = page.getByTestId('service-harness-surface');
		const dialog = harnessSurface
			.locator('[role="dialog"][aria-modal="true"]')
			.filter({ hasText: 'Premium Logo Package' })
			.last();
		await expect(dialog).toBeVisible({ timeout: 30_000 });

		const agreementButton = dialog.getByRole('button', { name: 'Service agreement' });
		await expect(agreementButton).toBeVisible();
		if ((await agreementButton.getAttribute('aria-expanded')) !== 'true') {
			await agreementButton.click();
		}

		await expect(dialog).toBeVisible();
		await expect(dialog).toHaveScreenshot('service-contract-drawer-chromium.png', {
			animations: 'disabled',
			caret: 'hide'
		});
	});

	test('matches the shared service completion modal', async ({ page }) => {
		await mockStableContractsVisualDependencies(page);
		await page.goto('/e2e/service-harness.html?case=contracts-surface-completable-service');
		await disableVisualMotion(page);

		const harnessSurface = page.getByTestId('service-harness-surface');
		const dialog = harnessSurface
			.locator('[role="dialog"][aria-modal="true"]')
			.filter({ hasText: 'Premium Logo Package' })
			.last();
		await expect(dialog).toBeVisible({ timeout: 30_000 });
		const completeButton = dialog.getByRole('button', { name: 'Mark Service Complete' });
		await expect(completeButton).toBeVisible();
		await completeButton.click();

		await expect(page.getByRole('heading', { name: 'Mark service as complete' })).toBeVisible();
		const completionModal = page.locator('.modal.modal-open').last();
		await expect(completionModal).toHaveScreenshot('service-contract-completion-modal-chromium.png', {
			animations: 'disabled',
			caret: 'hide'
		});
	});
});
