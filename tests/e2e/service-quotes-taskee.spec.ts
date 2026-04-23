import { test, expect } from '@playwright/test';

test.describe('service quotes taskee browser slice', () => {
	test('preserves provider service context while clearing an invalid request id', async ({
		page
	}) => {
		await page.goto('/e2e/service-harness.html?case=taskee-quotes');
		const harnessError = page.getByTestId('service-harness-error');
		const harnessOutput = page.getByTestId('service-harness-output');
		await expect(harnessError).toBeHidden();
		await expect(harnessOutput).toHaveText(/.+/);
		const result = JSON.parse(await harnessOutput.textContent());

		expect(result).toEqual({
			state: {
				tab: 'my-services',
				view: 'quotes',
				context: 'all',
				serviceAddress: `30402:${'a'.repeat(64)}:service-1234`,
				requestId: null,
				highlight: null
			},
			search: `tab=my-services&view=quotes&service=${encodeURIComponent(
				encodeURIComponent(
					`30402:${'a'.repeat(64)}:service-1234`
				)
			)}`,
			changed: true,
			messageCode: 'service_quotes_request_not_found'
		});
	});
});
