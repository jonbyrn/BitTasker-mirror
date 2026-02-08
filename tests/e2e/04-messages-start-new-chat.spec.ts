/**
 * Messages E2E: start new chat, send message, and verify the other user receives it.
 *
 * Test 1 (Nostr user): Opens new message, searches signup user, starts chat,
 * sends a unique test message, writes it to a file, and asserts it appears.
 *
 * Test 2 (signup user): Reads the message from file, finds that conversation,
 * opens it, and asserts the same message is visible.
 *
 * Run after 01-signup-onboarding (credentials file must exist).
 * Requires Nostr relay reachable.
 */
import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-from-file';
import { getUsernameForLabel } from './utils/webauthn-credentials';
import { writeLastE2EMessage, readLastE2EMessage } from './utils/e2e-last-message';

test.describe('Messages start new chat and send (Nostr user)', () => {
	test.skip(
		() => !webauthnCredentialsFileExists(),
		CREDENTIALS_MISSING_MESSAGE
	);

	test.use({ credentialLabel: 'nostr' });

	test('Nostr user opens new message, searches signup user, starts chat, sends message, sees it in history', async ({
		authenticatedPageFromPasskeyFile
	}) => {
		const page = authenticatedPageFromPasskeyFile;

		await expect(page).toHaveURL(/\/dashboard/);

		const signupUsername = getUsernameForLabel('signup');
		if (!signupUsername) {
			throw new Error(
				'Signup username not found in credentials file. Run 01-signup-onboarding first.'
			);
		}

		// Unique message per run so we assert on the one we just sent (no duplicates from past runs)
		const messageText = `E2E test message ${Date.now()}`;
		writeLastE2EMessage(messageText);

		await page.goto('/dashboard/messages', { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/\/dashboard\/messages/);

		await page.getByRole('button', { name: 'New Message', exact: true }).click();

		await expect(
			page.getByRole('heading', { name: /Start New Message/i })
		).toBeVisible({ timeout: 5_000 });

		const recipientInput = page.getByLabel(/Recipient.*npub or username/i);
		await recipientInput.fill(signupUsername);

		await expect(page.getByText(/Search Results/i)).toBeVisible({
			timeout: 10_000
		});

		await page
			.getByRole('button')
			.filter({ hasText: signupUsername })
			.first()
			.click();

		await page
			.locator('.modal-box')
			.getByRole('button', { name: /^Chat$/i })
			.click();

		await expect(page).toHaveURL(/\/dashboard\/messages\/to\/[a-fA-F0-9]{64}/);

		// Wait for "Loading messages" to disappear so the chat is ready
		await expect(page.getByText(/Loading messages/i)).toHaveCount(0, {
			timeout: 20_000
		});

		// Wait for message input to be available
		const messageInput = page.getByRole('textbox');
		await expect(messageInput).toBeVisible({ timeout: 10_000 });

		await messageInput.fill(messageText);

		await page
			.locator('form')
			.getByRole('button', { name: /Send message/i })
			.click();

		// Message appears on the page (avoid relying on log aria-label; search whole page)
		await expect(page.getByText(messageText, { exact: true })).toBeVisible({
			timeout: 15_000
		});
	});
});

test.describe('Messages receive (signup user)', () => {
	test.skip(
		() => !webauthnCredentialsFileExists(),
		CREDENTIALS_MISSING_MESSAGE
	);

	test.use({ credentialLabel: 'signup' });

	test('Signup user opens messages, finds conversation with Nostr user, sees the same test message', async ({
		authenticatedPageFromPasskeyFile
	}) => {
		const page = authenticatedPageFromPasskeyFile;

		const messageText = readLastE2EMessage();
		if (!messageText) {
			throw new Error(
				'Last E2E message not found. Run the Nostr user test first (first test in this file).'
			);
		}

		await expect(page).toHaveURL(/\/dashboard/);

		await page.goto('/dashboard/messages', { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/\/dashboard\/messages/);

		// Find the conversation that contains our unique message (from Nostr user)
		const conversationWithMessage = page
			.getByRole('button')
			.filter({ hasText: messageText });
		await expect(conversationWithMessage.first()).toBeVisible({
			timeout: 20_000
		});
		await conversationWithMessage.first().click();

		await expect(page).toHaveURL(/\/dashboard\/messages\/to\/[a-fA-F0-9]{64}/);

		// Chat loads and shows the same message (search whole page)
		await expect(page.getByText(messageText, { exact: true })).toBeVisible({
			timeout: 15_000
		});
	});
});
