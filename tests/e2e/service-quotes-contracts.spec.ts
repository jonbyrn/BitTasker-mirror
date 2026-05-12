import { test, expect, type Page } from '@playwright/test';

test.describe('service quote contracts browser slice', () => {
	test.describe.configure({ timeout: 90_000 });

	async function readHarnessResult(page: Page, timeout = 15_000) {
		await page.waitForFunction(
			() => {
				const error = document.querySelector('[data-testid="service-harness-error"]');
				if (error instanceof HTMLElement && error.innerText.trim().length > 0) {
					return { kind: 'error', value: error.innerText.trim() };
				}

				const output = document.querySelector('[data-testid="service-harness-output"]');
				if (output instanceof HTMLElement && output.innerText.trim().length > 0) {
					return { kind: 'output', value: output.innerText.trim() };
				}

				return false;
			},
			{ timeout }
		);

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
		const serviceTitle = harnessSurface.getByRole('button', { name: 'Premium Logo Package' });

		expect(result).toEqual({
			serviceCardPresent: true,
			serviceScopePresent: true,
			quotedServiceBadgePresent: true,
			actionLabelPresent: true
		});

		await expect(serviceTitle).toBeVisible();
		const dialog = harnessSurface
			.locator('[role="dialog"][aria-modal="true"]')
			.filter({ hasText: 'Premium Logo Package' })
			.last();
		if (!(await dialog.isVisible())) {
			await serviceTitle.click();
		}
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText('Logo system and brand guide')).toBeVisible();
		const approve = dialog.getByRole('button', { name: /^Approve/ });
		await expect(approve.first()).toBeVisible();
	});

	test('opens the shared service completion modal from the highlighted contracts surface', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=contracts-surface-completable-service');
		const result = await readHarnessResult(page, 30_000);
		const harnessSurface = page.getByTestId('service-harness-surface');
		const serviceTitle = harnessSurface.getByRole('button', { name: 'Premium Logo Package' });

		expect(result).toEqual({
			serviceCardPresent: true,
			highlightedDrawerPresent: false,
			serviceScopePresent: true,
			quotedServiceBadgePresent: true,
			completeActionPresent: true,
			agreementSchedulePresent: false
		});

		await expect(serviceTitle).toBeVisible();
		const dialog = harnessSurface
			.locator('[role="dialog"][aria-modal="true"]')
			.filter({ hasText: 'Premium Logo Package' })
			.last();
		if (!(await dialog.isVisible())) {
			await serviceTitle.click();
		}
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText('Logo system and brand guide')).toBeVisible();

		const completeButton = dialog.getByRole('button', { name: 'Complete' });
		await expect(completeButton).toBeVisible();
		await completeButton.click();

		const completionDrawer = page.getByRole('dialog', { name: 'Mark Task as Complete' }).last();
		await expect(completionDrawer).toBeVisible();
		await expect(completionDrawer.getByText('Premium Logo Package')).toBeVisible();
		await expect(
			completionDrawer.getByText(/Upload Completion Evidence|Share photos or video/i)
		).toBeVisible();
		await expect(completionDrawer.getByRole('button', { name: 'Mark as Complete' })).toBeVisible();
	});
});
