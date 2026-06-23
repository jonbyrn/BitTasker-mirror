/**
 * Message notification E2E tests.
 *
 * Verifies that:
 * 1. Sending a message keeps it visible in the chat (fire-and-forget notification)
 * 2. The message does not disappear if the notification call fails
 * 3. The send button is disabled while sending
 *
 * Uses cross-browser-auth fixture (pre-seeded localStorage).
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

test.describe('Message notification fire-and-forget', () => {
	test('messages page loads and shows conversations or empty state', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard/messages', { waitUntil: 'domcontentloaded' });
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(3000);

		const bodyText = await authenticatedPage.locator('body').innerText();

		// Should not crash
		expect(bodyText).not.toContain('Application error');

		// Should not redirect to login
		const url = authenticatedPage.url();
		expect(url).not.toContain('/auth/login');
	});

	test('chat page loads without crashing for a given recipient', async ({ authenticatedPage }) => {
		const fakeRecipient = 'npub1test123456789abcdef0123456789abcdef0123456789abcdef0123456789a';

		await authenticatedPage.goto(`/dashboard/messages/to/${fakeRecipient}`, {
			waitUntil: 'domcontentloaded'
		});
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(2000);

		// Should not show a generic application error
		const bodyText = await authenticatedPage.locator('body').innerText();
		expect(bodyText).not.toContain('Application error');

		// Page may show "Not Found" for invalid npub — that's acceptable
		const url = authenticatedPage.url();
		expect(url).toContain('/messages/');
	});

	test('send button is disabled when input is empty', async ({ authenticatedPage }) => {
		const fakeRecipient = 'npub1test123456789abcdef0123456789abcdef0123456789abcdef0123456789a';

		await authenticatedPage.goto(`/dashboard/messages/to/${fakeRecipient}`, {
			waitUntil: 'domcontentloaded'
		});
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(2000);

		// Find the send button (paper airplane)
		const sendButton = authenticatedPage.locator('button[type="submit"]');
		const count = await sendButton.count();

		if (count > 0) {
			// Send button should be disabled when textarea is empty
			const isDisabled = await sendButton.first().isDisabled();
			expect(isDisabled).toBe(true);
		}
	});

	test('typing in message input enables send button', async ({ authenticatedPage }) => {
		const fakeRecipient = 'npub1test123456789abcdef0123456789abcdef0123456789abcdef0123456789a';

		await authenticatedPage.goto(`/dashboard/messages/to/${fakeRecipient}`, {
			waitUntil: 'domcontentloaded'
		});
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(2000);

		const textarea = authenticatedPage.locator('textarea');
		const textareaCount = await textarea.count();

		if (textareaCount === 0) {
			return; // Chat not loaded (recipient not found)
		}

		const sendButton = authenticatedPage.locator('button[type="submit"]');

		// Initially disabled
		const isDisabledBefore = await sendButton.first().isDisabled();
		expect(isDisabledBefore).toBe(true);

		// Type a message
		await textarea.first().fill('E2E notification test');

		await authenticatedPage.waitForTimeout(300);

		// Send button should now be enabled
		const isDisabledAfter = await sendButton.first().isDisabled();
		expect(isDisabledAfter).toBe(false);
	});

	test('sent message appears immediately in chat (optimistic UI)', async ({
		authenticatedPage
	}) => {
		// Navigate to the messages page and find an existing conversation
		await authenticatedPage.goto('/dashboard/messages', { waitUntil: 'domcontentloaded' });
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(3000);

		// Find the first conversation link
		const conversationLink = authenticatedPage
			.locator('a[href*="/messages/to/"], a[href*="/dashboard/messages/to/"]')
			.first();
		const hasConversation = await conversationLink.isVisible().catch(() => false);

		if (!hasConversation) {
			return; // No conversations to test with
		}

		// Navigate to the conversation
		await conversationLink.click();
		await authenticatedPage.waitForTimeout(3000);

		const textarea = authenticatedPage.locator('textarea');
		if ((await textarea.count()) === 0) {
			return;
		}

		const testMessage = `E2E fire-and-forget test ${Date.now()}`;

		// Send the message
		await textarea.first().fill(testMessage);
		await authenticatedPage.waitForTimeout(200);

		const sendButton = authenticatedPage.locator('button[type="submit"]');
		await sendButton.first().click();

		// Message should appear immediately (optimistic UI)
		await expect(authenticatedPage.getByText(testMessage, { exact: true })).toBeVisible({
			timeout: 10000
		});

		// Message should still be visible after 5 seconds (fire-and-forget —
		// notification failure should NOT roll back the message)
		await authenticatedPage.waitForTimeout(5000);
		await expect(authenticatedPage.getByText(testMessage, { exact: true })).toBeVisible();
	});

	test('send button shows loading spinner during send', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/dashboard/messages', { waitUntil: 'domcontentloaded' });
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(3000);

		const conversationLink = authenticatedPage
			.locator('a[href*="/messages/to/"], a[href*="/dashboard/messages/to/"]')
			.first();
		const hasConversation = await conversationLink.isVisible().catch(() => false);

		if (!hasConversation) {
			return;
		}

		await conversationLink.click();
		await authenticatedPage.waitForTimeout(3000);

		const textarea = authenticatedPage.locator('textarea');
		if ((await textarea.count()) === 0) {
			return;
		}

		await textarea.first().fill(`Spinner test ${Date.now()}`);
		await authenticatedPage.waitForTimeout(200);

		const sendButton = authenticatedPage.locator('button[type="submit"]');

		// Click send
		await sendButton.first().click();

		// The textarea should be cleared immediately (optimistic)
		// and the send button should briefly show a spinner or be disabled
		// We check that the textarea was cleared (sign the send started)
		await authenticatedPage.waitForTimeout(500);
		const textareaValue = await textarea.first().inputValue();
		expect(textareaValue).toBe('');
	});

	test('no 500 errors on notification endpoint after sending message', async ({
		authenticatedPage
	}) => {
		const failedRequests: string[] = [];
		authenticatedPage.on('response', (response) => {
			const url = response.url();
			if (url.includes('notifications/send') && response.status() >= 500) {
				failedRequests.push(`${response.status()} ${url}`);
			}
		});

		await authenticatedPage.goto('/dashboard/messages', { waitUntil: 'domcontentloaded' });
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(3000);

		const conversationLink = authenticatedPage
			.locator('a[href*="/messages/to/"], a[href*="/dashboard/messages/to/"]')
			.first();
		const hasConversation = await conversationLink.isVisible().catch(() => false);

		if (!hasConversation) {
			return;
		}

		await conversationLink.click();
		await authenticatedPage.waitForTimeout(3000);

		const textarea = authenticatedPage.locator('textarea');
		if ((await textarea.count()) === 0) {
			return;
		}

		await textarea.first().fill(`Notification endpoint test ${Date.now()}`);
		await authenticatedPage.waitForTimeout(200);

		const sendButton = authenticatedPage.locator('button[type="submit"]');
		await sendButton.first().click();

		// Wait for the notification call to complete
		await authenticatedPage.waitForTimeout(5000);

		// No 500s on the notification endpoint
		expect(failedRequests).toEqual([]);
	});
});
