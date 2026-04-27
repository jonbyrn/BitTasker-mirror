import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-from-file';

test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);

test.use({ credentialLabel: 'signup' });
test.describe.configure({ timeout: 90_000 });

async function mockStablePricing(page: import('@playwright/test').Page) {
	await page.route('https://api.coinbase.com/**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				data: {
					amount: '63000'
				}
			})
		});
	});
}

test.describe('earning my services browser coverage', () => {
	test('navigates from the real my-services panel to the earning requests tab', async ({
		authenticatedPageFromPasskeyFile
	}) => {
		const page = authenticatedPageFromPasskeyFile;
		await mockStablePricing(page);

		await page.goto('/e2e/service-harness.html?case=my-services-panel-requests');
		await expect(page.getByTestId('service-harness-surface')).toContainText(
			'Brand Identity Sprint'
		);

		await page.getByRole('button', { name: 'Requests' }).click();

		await expect(page).toHaveURL(/\/earning\/requests\?service=30402%3Aa{64}%3Aservice-123/);
	});

	test('navigates from the real my-services panel to the earning contracts tab', async ({
		authenticatedPageFromPasskeyFile
	}) => {
		const page = authenticatedPageFromPasskeyFile;
		await mockStablePricing(page);

		await page.goto('/e2e/service-harness.html?case=my-services-panel-contracts');
		await expect(page.getByTestId('service-harness-surface')).toContainText(
			'Brand Identity Sprint'
		);

		await page.getByRole('button', { name: 'Contracts' }).click();

		await expect(page).toHaveURL(
			/\/earning\/contracts\?highlight=svc-escrow-live&service=30402%3Aa{64}%3Aservice-123/
		);
	});

	test('blocks deletion in the real my-services panel when an active contract exists', async ({
		authenticatedPageFromPasskeyFile
	}) => {
		const page = authenticatedPageFromPasskeyFile;
		await mockStablePricing(page);

		await page.goto('/e2e/service-harness.html?case=my-services-panel-contracts');
		await expect(page.getByTestId('service-harness-surface')).toContainText(
			'Brand Identity Sprint'
		);

		await page.getByRole('button', { name: 'Details' }).click();
		await page.getByRole('button', { name: 'Delete Service' }).click();

		await expect(
			page.getByText(/Active service contracts are still attached to this service/i)
		).toBeVisible();
		await expect(page.getByRole('button', { name: /Confirm Delete/i })).toHaveCount(0);
	});
});
