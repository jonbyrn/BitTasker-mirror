import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';
import { Buffer } from 'buffer';

test.describe('Feedback route', () => {
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
	test.use({ credentialLabel: 'signup' });

	test('shows validation error when feedback type is not selected', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/feedback', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/feedback$/);
		await page.locator('#description').fill(`E2E feedback without type ${Date.now()}`);

		await page
			.locator('form')
			.evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

		await expect(page.locator('.alert.alert-outline.text-error')).toBeVisible({ timeout: 10_000 });
	});

	test('shows validation error when description is missing', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/feedback', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/feedback$/);

		await page.locator('input[type="radio"][value="Bug"]').check();
		await page
			.locator('form')
			.evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

		await expect(page.locator('.alert.alert-outline.text-error')).toBeVisible({ timeout: 10_000 });
	});

	test('submits feedback successfully (feature request) and shows thank-you state', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.route('**/srv-api/feedback', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ ok: true })
			});
		});

		await page.goto('/feedback', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/feedback$/);

		await page.locator('input[type="radio"][value="Feature"]').check();
		await page.locator('#description').fill(`E2E feature request ${Date.now()}`);
		await page.locator('#contact').fill('qa@example.com');
		await page.locator('#screenshot').setInputFiles({
			name: 'feedback-e2e.png',
			mimeType: 'image/png',
			buffer: Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAukB9pR2v1sAAAAASUVORK5CYII=',
				'base64'
			)
		});

		await page.locator('button[type="submit"]').click();
		await expect(page.getByRole('button', { name: /submit more feedback/i })).toBeVisible({
			timeout: 15_000
		});
	});
});
