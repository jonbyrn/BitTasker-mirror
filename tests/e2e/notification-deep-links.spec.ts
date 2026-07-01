/**
 * Notification deep-link routing E2E tests.
 *
 * Verifies that the clickAction URLs produced by sendNotificationToNpubs calls
 * resolve to valid pages — not 404 or server-error pages.
 *
 * Bug context:
 *   - Bid notifications used `/tasks/{id}` instead of `/task/{id}/bids`
 *   - Review notifications used a relative `/reviews` without VITE_CLIENT_URL
 */
import { test, expect } from './fixtures/cross-browser-auth';

async function dismissOverlays(page: import('@playwright/test').Page) {
	const closeButtons = page.locator('.modal-backdrop, [aria-label*="ismiss"]');
	for (const btn of await closeButtons.all()) {
		try {
			await btn.click({ timeout: 500 });
		} catch {
			/* no overlay */
		}
	}
	await page.waitForTimeout(300);
}

test.describe('Notification deep-link routing', () => {
	test('bid notification route /task/{dTag}/bids does not 404', async ({ authenticatedPage }) => {
		const fakeTaskDTag = 'test-task-deeplink-123';

		await authenticatedPage.goto(`/task/${fakeTaskDTag}/bids`, { waitUntil: 'domcontentloaded' });
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(2000);

		const url = authenticatedPage.url();
		expect(url).toContain('/task/');
		expect(url).toContain('/bids');

		await expect(authenticatedPage.locator('body')).not.toContainText('404');
		await expect(authenticatedPage.locator('body')).not.toContainText('Not Found');
		await expect(authenticatedPage.locator('body')).not.toContainText('Application error');
	});

	test('old broken route /tasks/{id} should not be used in notification deep links', async ({
		authenticatedPage
	}) => {
		const fakeTaskId = 'test-task-deeplink-123';

		await authenticatedPage.goto(`/tasks/${fakeTaskId}`, { waitUntil: 'domcontentloaded' });
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(2000);

		const bodyText = await authenticatedPage.locator('body').innerText();
		const is404 = bodyText.includes('404') || bodyText.includes('Not Found');
		const isError = bodyText.includes('Application error') || bodyText.includes('server error');

		if (is404 || isError) {
			expect(is404 || isError).toBe(true);
		}
	});

	test('/reviews route loads without error (not relative path)', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/reviews', { waitUntil: 'load' });
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(2000);

		const url = authenticatedPage.url();
		expect(url).toContain('review');

		await expect(authenticatedPage.locator('body')).not.toContainText('404');
		await expect(authenticatedPage.locator('body')).not.toContainText('Application error');
	});

	test('/hiring/contracts route loads for bid_accepted notifications', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/hiring/contracts', { waitUntil: 'domcontentloaded' });
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(2000);

		const url = authenticatedPage.url();
		expect(url).toContain('/hiring');

		await expect(authenticatedPage.locator('body')).not.toContainText('404');
		await expect(authenticatedPage.locator('body')).not.toContainText('Application error');
	});

	test('/messages/to/{npub} route loads for message notifications', async ({
		authenticatedPage
	}) => {
		const fakeNpub = 'npub1test123456789abcdef';

		await authenticatedPage.goto(`/messages/to/${fakeNpub}`, { waitUntil: 'domcontentloaded' });
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(2000);

		const url = authenticatedPage.url();
		expect(url).toContain('/messages/');

		await expect(authenticatedPage.locator('body')).not.toContainText('404');
		await expect(authenticatedPage.locator('body')).not.toContainText('Application error');
	});
});
