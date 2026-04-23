import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ timeout: 60_000 });

async function readHarnessResult(page: Page) {
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
		{ timeout: 15_000 }
	);

	const harnessError = page.getByTestId('service-harness-error');
	if (await harnessError.count()) {
		throw new Error(await harnessError.innerText());
	}

	return JSON.parse(await page.getByTestId('service-harness-output').innerText());
}

async function readRequestsHarnessState(page: Page) {
	await expect(page.getByTestId('requests-harness-state')).toHaveText(/.+/);
	return JSON.parse(await page.getByTestId('requests-harness-state').innerText());
}

test.describe('service quote UX hardening browser slice', () => {
	test('keeps tasker quote focus while the exact request is still syncing', async ({ page }) => {
		await page.goto('/e2e/service-harness.html?case=tasker-quotes-sync-active');
		const result = await readHarnessResult(page);

		expect(result).toEqual({
			state: {
				tab: 'quotes',
				view: 'tasker',
				context: 'all',
				serviceAddress: null,
				requestId: 'qr_valid123',
				highlight: null
			},
			search: 'tab=quotes&view=tasker&request=qr_valid123',
			changed: false,
			messageCode: null
		});
	});

	test('drops tasker quote focus once the syncing window expires', async ({ page }) => {
		await page.goto('/e2e/service-harness.html?case=tasker-quotes-sync-expired');
		const result = await readHarnessResult(page);

		expect(result).toEqual({
			state: {
				tab: 'quotes',
				view: 'tasker',
				context: 'all',
				serviceAddress: null,
				requestId: null,
				highlight: null
			},
			search: 'tab=quotes&view=tasker',
			changed: true,
			messageCode: 'quotes_request_not_found'
		});
	});

	test('keeps provider quote focus while the selected service request is still syncing', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=taskee-quotes-sync-active');
		const result = await readHarnessResult(page);

		expect(result).toEqual({
			state: {
				tab: 'my-services',
				view: 'quotes',
				context: 'all',
				serviceAddress: `30402:${'a'.repeat(64)}:service-1234`,
				requestId: 'qr_valid123',
				highlight: null
			},
			search: `tab=my-services&view=quotes&service=${encodeURIComponent(
				encodeURIComponent(`30402:${'a'.repeat(64)}:service-1234`)
			)}&request=qr_valid123`,
			changed: false,
			messageCode: null
		});
	});

	test('shows a tasker partial-data alert while the exact thread is still syncing', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=tasker-quotes-partial-surface');
		const result = await readHarnessResult(page);

		expect(result).toEqual({
			partialAlertPresent: true,
			partialMessagePresent: true
		});
	});

	test('shows a provider partial-data alert while the exact thread is still syncing', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=taskee-quotes-partial-surface');
		const result = await readHarnessResult(page);

		expect(result).toEqual({
			partialAlertPresent: true,
			partialMessagePresent: true
		});
	});

	test('keeps the Requests workspace interactive while surfacing partial provider failures', async ({
		page
	}) => {
		const primaryServiceAddress = `30402:${'a'.repeat(64)}:service-1234`;
		const secondaryServiceAddress = `30402:${'a'.repeat(64)}:service-456`;

		await page.goto('/e2e/service-harness.html?case=earning-requests-regression');
		const result = await readHarnessResult(page);

		expect(result).toEqual({
			ready: true,
			state: JSON.stringify({
				selectedServiceAddress: primaryServiceAddress,
				focusedRequestId: 'qr_focus_1',
				loadError: null,
				visibleRequestIds: ['qr_focus_1', 'qr_focus_2']
			})
		});

		await page.getByRole('button', { name: 'View Proposal' }).click();
		await expect(
			page.locator('[data-testid="service-quotes-inbox"] [role="dialog"]:visible')
		).toHaveCount(1);
		await page.keyboard.press('Escape');

		await expect
			.poll(async () => (await readRequestsHarnessState(page)).focusedRequestId)
			.toBeNull();

		await page
			.getByRole('combobox', { name: 'Filter by service' })
			.selectOption(secondaryServiceAddress);
		await expect
			.poll(async () => await readRequestsHarnessState(page))
			.toEqual({
				selectedServiceAddress: secondaryServiceAddress,
				focusedRequestId: null,
				loadError: null,
				visibleRequestIds: ['qr_focus_3']
			});

		await page.getByRole('combobox', { name: 'Filter by service' }).selectOption('');
		await expect
			.poll(async () => await readRequestsHarnessState(page))
			.toEqual({
				selectedServiceAddress: null,
				focusedRequestId: null,
				loadError: null,
				visibleRequestIds: ['qr_focus_1', 'qr_focus_2', 'qr_focus_3']
			});

		await page.getByTestId('requests-harness-partial-failure').click();
		await expect
			.poll(async () => await readRequestsHarnessState(page))
			.toEqual({
				selectedServiceAddress: null,
				focusedRequestId: null,
				loadError: 'provider query failed',
				visibleRequestIds: ['qr_focus_1', 'qr_focus_2']
			});
		const requestsInbox = page.getByTestId('service-quotes-inbox');
		await expect(requestsInbox.getByText('provider query failed')).toBeVisible();
		await expect(requestsInbox.getByTestId('service-quotes-summary-card')).toBeVisible();
		await expect(requestsInbox.getByTestId('service-request-card-qr_focus_1')).toBeVisible();
		await expect(
			requestsInbox.getByText('Retry to load quote requests for this service.')
		).toHaveCount(0);
	});

	test('keeps cached service contracts visible while surfacing a stale-data warning', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=contracts-surface-stale-data');
		const result = await readHarnessResult(page);

		expect(result).toEqual({
			staleAlertPresent: true,
			serviceCardPresent: true,
			staleMessagePresent: true
		});
	});
});
