import { expect, test } from '@playwright/test';

test.describe('BitTasker Credit test ledger', () => {
	test.describe.configure({ mode: 'serial', timeout: 60_000 });

	test('request, fund, and repay the lender before the tasker', async ({ page }) => {
		await page.goto('/credit?creditMock=1', { waitUntil: 'domcontentloaded' });
		await expect(page.getByTestId('credit-beta-banner')).toBeVisible({ timeout: 20_000 });
		await page.getByTestId('credit-role-worker').click();
		await page.getByTestId('credit-confirm-escrow').click();
		await expect(page.getByTestId('credit-max-advance')).toContainText('$40.00');
		await page.getByTestId('credit-request').click();
		await page.goto('/credit/offers?creditMock=1');
		await expect(page.getByTestId('credit-offer')).toBeVisible();
		await page.getByTestId('credit-offer').click();
		await page.goto('/credit?creditMock=1');
		await page.getByTestId('credit-role-worker').click();
		await page.getByTestId('credit-accept').click();
		await page.getByTestId('credit-role-lender').click();
		await page.getByTestId('credit-fund').click();
		await expect(page.getByTestId('credit-funding-status')).toHaveText('Waiting for confirmation');
		await page.getByTestId('credit-confirm-funding').click();
		await expect(page.getByTestId('credit-funding-status')).toHaveText('Funded');
		await page.getByTestId('credit-role-hirer').click();
		await page.getByTestId('credit-complete').click();
		await expect(page.getByTestId('credit-lender-received')).toContainText('$40.40');
		await expect(page.getByTestId('credit-worker-received')).toContainText('$59.60');
		await expect(page.getByTestId('credit-sum')).toContainText('$100.00');
	});

	test('a cancelled job refunds the hirer and does not repay the lender', async ({ page }) => {
		await page.goto('/credit?creditMock=1', { waitUntil: 'domcontentloaded' });
		await expect(page.getByTestId('credit-reset')).toBeVisible({ timeout: 20_000 });
		await page.getByTestId('credit-reset').click();
		await page.getByTestId('credit-role-worker').click();
		await page.getByTestId('credit-confirm-escrow').click();
		await page.getByTestId('credit-request').click();
		await page.getByTestId('credit-role-lender').click();
		await page.getByTestId('credit-offer').click();
		await page.getByTestId('credit-role-worker').click();
		await page.getByTestId('credit-accept').click();
		await page.getByTestId('credit-role-lender').click();
		await page.getByTestId('credit-fund').click();
		await page.getByTestId('credit-confirm-funding').click();
		await page.getByTestId('credit-role-hirer').click();
		await page.getByTestId('credit-cancel').click();
		await expect(page.getByTestId('credit-funding-status')).toHaveText('Defaulted');
		await expect(page.getByTestId('credit-hirer-refund')).toContainText('$100.00');
		await expect(page.getByTestId('credit-lender-received')).toContainText('$0.00');
		await expect(page.getByTestId('credit-loss')).toContainText('$40.00');
	});
});
