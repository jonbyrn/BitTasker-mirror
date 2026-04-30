import { test, expect } from '@playwright/test';

test.describe('service quotes tasker browser slice', () => {
	test('canonicalizes invalid tasker quote deep links inside the browser bundle', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=tasker-quotes');
		const harnessError = page.getByTestId('service-harness-error');
		const harnessOutput = page.getByTestId('service-harness-output');
		await expect(harnessError).toBeHidden();
		await expect(harnessOutput).toHaveText(/.+/);
		const result = JSON.parse(await harnessOutput.textContent());

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

	test('builds the expired-tasker reentry path back to the canonical service detail route', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=tasker-expired-reentry');
		const harnessError = page.getByTestId('service-harness-error');
		const harnessOutput = page.getByTestId('service-harness-output');
		await expect(harnessError).toBeHidden();
		await expect(harnessOutput).toHaveText(/.+/);
		const result = JSON.parse(await harnessOutput.textContent());

		expect(result).toEqual({
			pathname: '/services/service-1234',
			search: 'quote=request&tier=standard&addons=source-files'
		});
	});
});
