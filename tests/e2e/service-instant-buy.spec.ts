import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';

async function waitForHarnessResult(page: Page) {
	await page.waitForFunction(() => {
		const output = document.querySelector('[data-testid="service-harness-output"]');
		const error = document.querySelector('[data-testid="service-harness-error"]');
		return Boolean(output?.textContent?.trim() || error?.textContent?.trim());
	}, undefined, {
		timeout: 15_000
	});
}

test.describe('service instant-buy browser slice', () => {
	test('derives deterministic eligibility and snapshot timing in the browser bundle', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=instant-buy');
		const harnessError = page.getByTestId('service-harness-error');
		const harnessOutput = page.getByTestId('service-harness-output');
		await waitForHarnessResult(page);
		await expect(harnessError).toBeHidden();
		await expect(harnessOutput).toHaveText(/.+/);
		const result = JSON.parse(await harnessOutput.textContent());

		expect(result.eligibility).toEqual({
			eligible: true,
			code: 'eligible',
			purchaseMode: 'instant_buy'
		});
		expect(result.schedule).toEqual({
			estimatedStartTime: 1_700_086_400,
			estimatedEndTime: 1_700_345_600,
			deliverySeconds: 259200
		});
		expect(result.selectedTierId).toBeUndefined();
		expect(result.instantOrderId).toMatch(/^sib_[A-Za-z0-9]{16}$/);
		expect(result.purchaseKeyLength).toBe(64);
	});

	test('maps the instant-buy snapshot through the shared service contract helper in-browser', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=instant-buy-contract-mapping');
		const harnessError = page.getByTestId('service-harness-error');
		const harnessOutput = page.getByTestId('service-harness-output');
		await waitForHarnessResult(page);
		await expect(harnessError).toBeHidden();
		await expect(harnessOutput).toHaveText(/.+/);
		const result = JSON.parse((await harnessOutput.textContent()) ?? 'null');

		expect(result).toEqual({
			contextType: 'service',
			contextId: 'service-123',
			purchaseMode: 'instant_buy',
			instantOrderId: expect.stringMatching(/^sib_[A-Za-z0-9]{16}$/)
		});
	});

	test('consumes a pending instant-buy transaction into a highlighted contracts handoff in-browser', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=instant-buy-pending-navigation');
		const harnessError = page.getByTestId('service-harness-error');
		const harnessOutput = page.getByTestId('service-harness-output');
		await waitForHarnessResult(page);
		await expect(harnessError).toBeHidden();
		await expect(harnessOutput).toHaveText(/.+/);
		const result = JSON.parse((await harnessOutput.textContent()) ?? 'null');

		expect(result).toEqual({
			pending: {
				transactionHash: '0xabc123',
				createdAtMs: 1_700_000_000_000
			},
			consumedEscrowId: 'svc-escrow-123',
			remaining: null
		});
	});
});
