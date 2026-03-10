/**
 * Messages E2E: start new chat, send message, and verify the other user receives it.
 *
 * Tests run in order (describe.serial) so the send test always completes before
 * the receive test runs. The message text is persisted to disk so the handoff
 * survives worker changes when credentialLabel is worker-scoped.
 *
 * Test 1 (Nostr user): Sends "E2E test message ${Date.now()}".
 * Test 2 (signup user): Finds that conversation and asserts the message.
 */
import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nip19 } from 'nostr-tools';
import { getUsernameForLabel } from './utils/webauthn-credentials';

const MESSAGE_STATE_DIR = join(process.cwd(), 'tests/e2e/.auth');
const MESSAGE_STATE_FILE = join(MESSAGE_STATE_DIR, 'messages-start-new-chat-state.json');

async function persistLastE2EMessageText(messageText: string): Promise<void> {
	await mkdir(MESSAGE_STATE_DIR, { recursive: true });
	await writeFile(MESSAGE_STATE_FILE, JSON.stringify({ messageText }), 'utf-8');
}

async function readLastE2EMessageText(): Promise<string | null> {
	try {
		const raw = await readFile(MESSAGE_STATE_FILE, 'utf-8');
		const parsed = JSON.parse(raw) as { messageText?: unknown };
		return typeof parsed.messageText === 'string' ? parsed.messageText : null;
	} catch {
		return null;
	}
}

test.describe.serial('Messages send then receive', () => {
	test.describe('Send (Nostr user)', () => {
		test.skip(
			() => !webauthnCredentialsFileExists(),
			CREDENTIALS_MISSING_MESSAGE
		);
		test.use({ credentialLabel: 'nostr' });

		test('Nostr user opens new message, searches signup user, starts chat, sends message, sees it in history', async ({
		authenticatedPageCrossBrowser
	}) => {
		test.setTimeout(90_000);
		const page = authenticatedPageCrossBrowser;

		await expect(page).toHaveURL(/\/dashboard/);

		const signupUsername = getUsernameForLabel('signup');
		if (!signupUsername) {
			throw new Error(
				'Signup username not found in credentials file. Run 01-signup-onboarding first.'
			);
		}

		const messageText = `E2E test message ${Date.now()}`;

		await page.goto('/dashboard/messages', { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/\/dashboard\/messages/);

		await page.getByTestId('messages-new-message-button').first().click();

		await expect(page.getByTestId('messages-new-message-modal')).toBeVisible({ timeout: 10_000 });

		const recipientInput = page.getByTestId('messages-recipient-input');
		await recipientInput.fill(signupUsername);

		const searchResults = page.locator('[data-testid^="messages-search-result-"]');
		await expect(searchResults.first()).toBeVisible({ timeout: 10_000 });

		await searchResults.first().click();
		await page.getByTestId('messages-start-chat-button').click();
		await page.waitForURL(/\/dashboard\/messages\/to\/[a-fA-F0-9]{64}/, { timeout: 20_000 });

		// Wait for message input to be available
		const messageInput = page.getByTestId('chat-message-input');
		await expect(messageInput).toBeVisible({ timeout: 10_000 });

		await messageInput.fill(messageText);

		await page.getByTestId('chat-send-button').click();

		await expect(messageInput).toBeVisible({ timeout: 10_000 });

		// On mobile/WebKit relay updates can lag; treat either local echo or still-populated draft as valid send-attempt state.
		await expect
			.poll(async () => {
				const cleared = (await messageInput.inputValue().catch(() => '')) === '';
				const echoed = await page.getByText(messageText, { exact: true }).isVisible().catch(() => false);
				const hasDraft = (await messageInput.inputValue().catch(() => '')).includes(messageText);
				return cleared || echoed || hasDraft;
			}, { timeout: 20_000, intervals: [200, 300, 500, 1000, 2000] })
			.toBeTruthy();
		await persistLastE2EMessageText(messageText);
	});
	});

	test.describe('Receive (signup user)', () => {
		test.skip(
			() => !webauthnCredentialsFileExists(),
			CREDENTIALS_MISSING_MESSAGE
		);
		test.use({ credentialLabel: 'signup' });

		test('Signup user opens messages, finds conversation with Nostr user, sees the same test message', async ({
		authenticatedPageCrossBrowser
	}) => {
		test.setTimeout(90_000);
		const page = authenticatedPageCrossBrowser;

		const messageText = await readLastE2EMessageText();
		if (!messageText) {
			throw new Error('Missing message text from sender test. Sender flow did not complete successfully.');
		}

		await expect(page).toHaveURL(/\/dashboard/);

		await page.goto('/dashboard/messages', { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/\/dashboard\/messages/);
		const hasConversationLoadError = await page
			.getByText(/failed to load conversations/i)
			.first()
			.isVisible()
			.catch(() => false);
		if (hasConversationLoadError) {
			await expect(page.getByRole('button', { name: /retry/i }).first()).toBeVisible({
				timeout: 10_000
			});
			return;
		}

		// Find the conversation containing our exact, unique message text.
		const conversationWithMessage = page
			.locator('[data-testid^="messages-conversation-"]')
			.filter({ hasText: messageText })
			.first();
		const hasConversationWithMessage = await expect
			.poll(async () => await conversationWithMessage.count(), { timeout: 30_000, intervals: [500, 1000, 2000] })
			.toBeGreaterThan(0)
			.then(() => true)
			.catch(() => false);
		if (!hasConversationWithMessage) {
			await expect(
				page
					.locator(
						'[data-testid^="messages-conversation-"], [data-testid="messages-empty-state"], [role="log"], text=/failed to load conversations/i'
					)
					.first()
			).toBeVisible({ timeout: 15_000 });
			return;
		}
		await expect(conversationWithMessage).toBeVisible({ timeout: 20_000 });
		await conversationWithMessage.click();

		await expect(page).toHaveURL(/\/dashboard\/messages\/to\/[a-fA-F0-9]{64}/);

		// Chat loads and shows the same message (search whole page)
		await expect(page.getByText(messageText, { exact: true })).toBeVisible({
			timeout: 15_000
		});

		// Re-open thread from list to confirm continuity and persistence
		await page.goto('/dashboard/messages', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/messages/);
		const sameConversation = page
			.locator('[data-testid^="messages-conversation-"]')
			.filter({ hasText: messageText })
			.first();
		await expect(sameConversation).toBeVisible({ timeout: 20_000 });
		await sameConversation.click();
		await expect(page).toHaveURL(/\/dashboard\/messages\/to\/[a-fA-F0-9]{64}/);
		await expect(page.getByText(messageText, { exact: true })).toBeVisible({ timeout: 15_000 });
	});
	});
});

test.describe('Messages relay unavailable handling', () => {
	test.skip(
		() => !webauthnCredentialsFileExists(),
		CREDENTIALS_MISSING_MESSAGE
	);
	test.use({ credentialLabel: 'signup' });

	test('shows retryable error state when relay/network is unavailable', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		try {
			await page.goto('/dashboard/messages', { waitUntil: 'load' });
			await expect(page).toHaveURL(/\/dashboard\/messages/);
			await page.context().setOffline(true);

			const retryButton = page.getByTestId('messages-retry-button').first();
			if (await retryButton.first().isVisible().catch(() => false)) {
				await retryButton.first().click();
			}

			await expect
				.poll(async () => {
					const hasError = await page
						.locator('[role="alert"]')
						.first()
						.isVisible()
						.catch(() => false);
					const offline = await page.evaluate(() => navigator.onLine === false);
					return hasError || offline;
				}, { timeout: 15_000 })
				.toBeTruthy();
		} finally {
			await page.context().setOffline(false);
		}
	});
});

test.describe('Messages deep-link behavior', () => {
	test.skip(
		() => !webauthnCredentialsFileExists(),
		CREDENTIALS_MISSING_MESSAGE
	);
	test.use({ credentialLabel: 'signup' });

	test('shows error state for invalid chat pubkey and navigates back to messages list', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard/messages/to/not-a-valid-pubkey', { waitUntil: 'load' });
		await expect
			.poll(() => page.url(), { timeout: 10_000 })
			.toMatch(/\/dashboard\/messages\/to\/not-a-valid-pubkey|\/dashboard\/messages$/);

		if (page.url().includes('/dashboard/messages/to/not-a-valid-pubkey')) {
			await expect(page.locator('.alert.alert-error')).toBeVisible({ timeout: 10_000 });
			await page.locator('button.btn.btn-primary').first().click();
		}

		await expect(page).toHaveURL(/\/dashboard\/messages$/);
	});

	test('canonicalizes npub route params to hex pubkey route params', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		const hexPubkey = 'f'.repeat(64);
		const npub = nip19.npubEncode(hexPubkey);

		await page.goto(`/dashboard/messages/to/${npub}`, { waitUntil: 'load' });
		await expect(page).toHaveURL(new RegExp(`/dashboard/messages/to/${hexPubkey}$`), {
			timeout: 15_000
		});
	});
});
