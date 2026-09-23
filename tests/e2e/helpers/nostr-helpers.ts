import { Page } from '@playwright/test';
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';

export async function waitForDMReceived(
	page: Page,
	recipientPubkey: string,
	timeout: number = 10000
): Promise<boolean> {
	// Wait for the recipient to receive a DM
	return page.evaluate(
		async ({ recipientPubkey, timeout }) => {
			return new Promise((resolve) => {
				const start = Date.now();
				const checkInterval = setInterval(() => {
					const chatStore = window.__chatStore__;
					if (chatStore) {
						const messages = chatStore.getMessages();
						const hasMessage = messages.some(
							(msg: { sender?: string; isRead?: boolean }) =>
								msg.sender === recipientPubkey && !msg.isRead
						);
						if (hasMessage) {
							clearInterval(checkInterval);
							resolve(true);
							return;
						}
					}

					if (Date.now() - start > timeout) {
						clearInterval(checkInterval);
						resolve(false);
					}
				}, 500);
			});
		},
		{ recipientPubkey, timeout }
	);
}

export async function sendTestDM(
	page: Page,
	recipientPubkey: string,
	message: string
): Promise<void> {
	// Use the app's UI to send a DM
	await page.fill('[data-testid="message-input"]', message);
	await page.click('[data-testid="send-button"]');

	// Wait a bit for the message to be sent
	await page.waitForTimeout(1000);
}

export async function createTestSigner(): Promise<NDKPrivateKeySigner> {
	// Generate a new private key for testing
	return NDKPrivateKeySigner.generate();
}
