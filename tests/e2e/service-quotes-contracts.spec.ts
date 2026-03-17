import { test, expect, type Page } from '@playwright/test';

test.describe('service quote contracts browser slice', () => {
	test.describe.configure({ timeout: 90_000 });

	async function readHarnessResult(page: Page, timeout = 15_000) {
		await page.waitForFunction(() => {
			const error = document.querySelector('[data-testid="service-harness-error"]');
			if (error instanceof HTMLElement && error.innerText.trim().length > 0) {
				return { kind: 'error', value: error.innerText.trim() };
			}

			const output = document.querySelector('[data-testid="service-harness-output"]');
			if (output instanceof HTMLElement && output.innerText.trim().length > 0) {
				return { kind: 'output', value: output.innerText.trim() };
			}

			return false;
		}, { timeout });

		const harnessError = page.getByTestId('service-harness-error');
		if (await harnessError.count()) {
			throw new Error(await harnessError.innerText());
		}

		return JSON.parse(await page.getByTestId('service-harness-output').innerText());
	}

	test('drops invalid contract highlights while preserving the service filter context', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=contracts-highlight');
		const result = await readHarnessResult(page);

		expect(result).toEqual({
			state: {
				tab: 'contracts',
				view: 'default',
				context: 'services',
				serviceAddress: null,
				requestId: null,
				highlight: null
			},
			search: 'tab=contracts&context=services',
			messageCode: 'contracts_highlight_not_found',
			nextUrl: 'https://bittasker.test/dashboard?tab=contracts&context=services'
		});
	});

	test('preserves valid service contract highlights without rewriting the canonical route', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=contracts-highlight-valid');
		const result = await readHarnessResult(page);

		expect(result).toEqual({
			state: {
				tab: 'contracts',
				view: 'default',
				context: 'services',
				serviceAddress: null,
				requestId: null,
				highlight: 'svc-escrow_123'
			},
			search: 'tab=contracts&context=services&highlight=svc-escrow_123',
			changed: false,
			messageCode: null
		});
	});

	test('rewrites provider quote routes into canonical service contracts links without stale quote params', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=contracts-from-provider-quotes');
		const result = await readHarnessResult(page);

		expect(result).toEqual({
			nextUrl:
				'https://bittasker.test/dashboard?tab=contracts&context=services&highlight=svc-escrow_123',
			state: {
				tab: 'contracts',
				view: 'default',
				context: 'services',
				serviceAddress: null,
				requestId: null,
				highlight: 'svc-escrow_123'
			},
			search: 'tab=contracts&context=services&highlight=svc-escrow_123',
			changed: false,
			messageCode: null
		});
	});

	test('rewrites tasker quote routes into canonical service contracts links without stale quote params', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=contracts-from-tasker-quotes');
		const result = await readHarnessResult(page);

		expect(result).toEqual({
			nextUrl:
				'https://bittasker.test/dashboard?tab=contracts&context=services&highlight=svc-escrow_123',
			state: {
				tab: 'contracts',
				view: 'default',
				context: 'services',
				serviceAddress: null,
				requestId: null,
				highlight: 'svc-escrow_123'
			},
			search: 'tab=contracts&context=services&highlight=svc-escrow_123',
			changed: false,
			messageCode: null
		});
	});

	test('consumes pending service-contract navigation and builds the canonical highlighted contracts link', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=contracts-pending-navigation-consumed');
		const result = await readHarnessResult(page);

		expect(result).toEqual({
			highlightEscrowId: 'svc-escrow-123',
			nextUrl:
				'https://bittasker.test/dashboard?tab=contracts&context=services&highlight=svc-escrow-123',
			remaining: null
		});
	});

	test('preserves pending service-contract navigation when a contracts highlight already exists', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=contracts-pending-navigation-preserved');
		const result = await readHarnessResult(page);

		expect(result).toEqual({
			highlightEscrowId: null,
			remaining: {
				transactionHash: '0xabc123',
				createdAtMs: 1_700_000_000_000
			}
		});
	});

	test('lands funded service handoff in the real shared contracts surface', async ({ page }) => {
		await page.goto('/e2e/service-harness.html?case=contracts-surface-highlighted-service');
		const result = await readHarnessResult(page, 30_000);
		const harnessSurface = page.getByTestId('service-harness-surface');
		const serviceCard = harnessSurface.locator('[data-contract-escrow-id="svc-escrow_123"]').first();

		expect(result).toEqual({
			serviceCardPresent: true,
			serviceScopePresent: true,
			quotedServiceBadgePresent: true,
			actionLabelPresent: true
		});

		await expect(serviceCard).toBeVisible();
		const dialog = harnessSurface
			.locator('[role="dialog"][aria-modal="true"]')
			.filter({ hasText: 'Premium Logo Package' })
			.last();
		if (!(await dialog.isVisible())) {
			await serviceCard.click();
		}
		await expect(dialog).toBeVisible();
		const agreementButton = harnessSurface.getByRole('button', { name: 'Service agreement' });
		await expect(agreementButton).toBeVisible();
		if ((await agreementButton.getAttribute('aria-expanded')) !== 'true') {
			await agreementButton.click();
		}
		await expect(harnessSurface.getByTestId('service-agreement-summary')).toBeVisible();
		await expect(harnessSurface.getByTestId('service-agreement-scope')).toBeVisible();
		await expect(harnessSurface.getByRole('button', { name: 'Accept Service' }).first()).toBeVisible();
	});

	test('opens the shared service completion modal from the highlighted contracts surface', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=contracts-surface-completable-service');
		const result = await readHarnessResult(page, 30_000);
		const harnessSurface = page.getByTestId('service-harness-surface');
		const serviceCard = harnessSurface.locator('[data-contract-escrow-id="svc-escrow_123"]').first();

		expect(result).toEqual({
			serviceCardPresent: true,
			highlightedDrawerPresent: true,
			serviceScopePresent: true,
			quotedServiceBadgePresent: true,
			completeActionPresent: true,
			agreementSchedulePresent: false
		});

		await expect(serviceCard).toBeVisible();
		const dialog = harnessSurface
			.locator('[role="dialog"][aria-modal="true"]')
			.filter({ hasText: 'Premium Logo Package' })
			.last();
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText('Quoted Service')).toBeVisible();
		await expect(dialog.getByTestId('service-agreement-scope')).toHaveText('Logo system and brand guide');

		const completeButton = dialog.getByRole('button', { name: 'Mark Service Complete' });
		await expect(completeButton).toBeVisible();
		await completeButton.click();

		const completionModal = page.locator('.modal.modal-open').filter({ hasText: 'Service details' });
		await expect(completionModal.getByRole('heading', { name: 'Mark service as complete' })).toBeVisible();
		await expect(completionModal.getByText('Premium Logo Package')).toBeVisible();
		await expect(completionModal.getByText('Upload service delivery evidence')).toBeVisible();
		await expect(completionModal.getByText('Agreement schedule')).toBeVisible();
		await expect(completionModal.getByTestId('service-agreement-summary')).toHaveCount(0);
		await expect(completionModal.getByRole('button', { name: 'Mark service complete' })).toBeVisible();
	});
});
