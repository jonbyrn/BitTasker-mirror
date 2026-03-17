import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ timeout: 60_000 });

async function readHarnessResult(page: Page) {
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
	}, { timeout: 15_000 });

	const harnessError = page.getByTestId('service-harness-error');
	if (await harnessError.count()) {
		throw new Error(await harnessError.innerText());
	}

	return JSON.parse(await page.getByTestId('service-harness-output').innerText());
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
