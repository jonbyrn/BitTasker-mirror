/**
 * Review Management E2E Tests
 *
 * Tests the review management page: tabs, empty states, and navigation.
 * Run after 01-signup-onboarding. Requires VITE_NOSTR_RELAY_URL for
 * full review data; tests handle empty states gracefully.
 */
import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from '../fixtures/passkey-auth-from-file';

test.describe('Review Management', () => {
	test.skip(
		() => !webauthnCredentialsFileExists(),
		CREDENTIALS_MISSING_MESSAGE
	);

	test.use({ credentialLabel: 'signup' });

	test.beforeEach(async ({ authenticatedPageFromPasskeyFile }) => {
		await authenticatedPageFromPasskeyFile.goto('/dashboard/reviews', {
			waitUntil: 'load'
		});
		await authenticatedPageFromPasskeyFile.waitForLoadState('networkidle');
	});

	test('displays all three tabs: Received, Given, Pending', async ({
		authenticatedPageFromPasskeyFile
	}) => {
		const page = authenticatedPageFromPasskeyFile;

		await expect(page.getByRole('button', { name: /Received/i })).toBeVisible({
			timeout: 15_000
		});
		await expect(page.getByRole('button', { name: /Given/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /Pending/i })).toBeVisible();
	});

	test('Pending tab is active by default', async ({
		authenticatedPageFromPasskeyFile
	}) => {
		const page = authenticatedPageFromPasskeyFile;

		// Pending tab should have tab-active class
		const pendingTab = page.getByRole('button', { name: /Pending/i });
		await expect(pendingTab).toBeVisible({ timeout: 15_000 });
		await expect(pendingTab).toHaveClass(/tab-active/);
	});

	test('switches to Given tab and shows content', async ({
		authenticatedPageFromPasskeyFile
	}) => {
		const page = authenticatedPageFromPasskeyFile;

		await page.getByRole('button', { name: /Given/i }).click();

		// Given tab should become active
		await expect(
			page.getByRole('button', { name: /Given/i })
		).toHaveClass(/tab-active/);

		// Content: either "No reviews yet" or review cards
		const content = page.locator('text=/No reviews yet|Verified|rating/i').first();
		await expect(content).toBeVisible({ timeout: 5_000 });
	});

	test('switches to Received tab and shows content', async ({
		authenticatedPageFromPasskeyFile
	}) => {
		const page = authenticatedPageFromPasskeyFile;

		await page.getByRole('button', { name: /Received/i }).click();

		// Received tab should become active
		await expect(
			page.getByRole('button', { name: /Received/i })
		).toHaveClass(/tab-active/);

		// Content: ReviewList loads (may show empty or reviews)
		await page.waitForLoadState('networkidle');
		// Page should not show error
		await expect(
			page.getByRole('heading', { name: /Review Management/i })
		).toBeVisible();
	});

	test('Pending tab shows empty state when no pending reviews', async ({
		authenticatedPageFromPasskeyFile
	}) => {
		const page = authenticatedPageFromPasskeyFile;

		// Wait for pending list to load
		await page.waitForLoadState('networkidle');

		// Pending tab content: either list of pending items or empty state
		// Empty state: "You're all caught up!" or "No pending reviews"
		const pendingContent = page.locator(
			'.pending-reviews-list, text=/all caught up|No pending|Review Now/i'
		).first();
		await expect(pendingContent).toBeVisible({ timeout: 15_000 });
	});

	test('page shows Review Management title and description', async ({
		authenticatedPageFromPasskeyFile
	}) => {
		const page = authenticatedPageFromPasskeyFile;

		await expect(
			page.getByRole('heading', { name: /Review Management/i })
		).toBeVisible({ timeout: 15_000 });

		await expect(
			page.getByText(/Manage your reviews|pending reviews|given and received/i)
		).toBeVisible();
	});
});
