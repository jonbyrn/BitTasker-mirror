import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';
import { requireMobileSafari } from './utils/ios-interactions';

const DUMMY_RECIPIENT_PUBKEY = 'f'.repeat(64);

async function gotoMessagesThread(
	page: import('@playwright/test').Page,
	recipientPubkey: string
): Promise<void> {
	const threadPattern = new RegExp(`/dashboard/messages/to/${recipientPubkey}$`);
	const listPattern = /\/dashboard\/messages(?:\?.*)?$/;
	const messagesNav = page.locator("a[href='/dashboard/messages']").first();

	for (let attempt = 0; attempt < 3; attempt += 1) {
		await page.goto(`/dashboard/messages/to/${recipientPubkey}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
		if (threadPattern.test(page.url())) return;

		await page.goto('/dashboard/messages', { waitUntil: 'domcontentloaded' }).catch(() => {});
		if (listPattern.test(page.url())) {
			await page.goto(`/dashboard/messages/to/${recipientPubkey}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
			if (threadPattern.test(page.url())) return;
		}

		if (await messagesNav.isVisible().catch(() => false)) {
			await messagesNav.click({ force: true }).catch(() => {});
			if (listPattern.test(page.url())) {
				await page
					.goto(`/dashboard/messages/to/${recipientPubkey}`, { waitUntil: 'domcontentloaded' })
					.catch(() => {});
				if (threadPattern.test(page.url())) return;
			}
		}
	}

	await expect
		.poll(() => page.url(), { timeout: 15_000, intervals: [200, 400, 800, 1200] })
		.toMatch(new RegExp(`/dashboard/messages/to/${recipientPubkey}$`));
}

test.describe('iOS messages overlay regressions', () => {
	test.describe.configure({ timeout: 90_000, retries: 0 });
	test.use({ credentialLabel: 'signup' });
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);

	test('emoji picker opens, inserts emoji, and closes cleanly', async ({
		authenticatedPageCrossBrowser
	}, testInfo) => {
		requireMobileSafari(testInfo);
		const page = authenticatedPageCrossBrowser;

		await gotoMessagesThread(page, DUMMY_RECIPIENT_PUBKEY);

		const input = page.getByTestId('chat-message-input').first();
		await expect(input).toBeVisible({ timeout: 20_000 });

		const emojiToggle = page.getByRole('button', { name: 'Add emoji' }).first();
		await expect(emojiToggle).toBeVisible({ timeout: 10_000 });
		await emojiToggle.click();

		const pickerTitle = page.locator('h4', { hasText: 'Choose Emoji' }).first();
		await expect(pickerTitle).toBeVisible({ timeout: 10_000 });

		const firstEmoji = page.locator('.grid.grid-cols-7 button').first();
		await expect(firstEmoji).toBeVisible({ timeout: 10_000 });
		await firstEmoji.click();

		await expect(pickerTitle).toBeHidden({ timeout: 10_000 });
		await expect
			.poll(async () => (await input.inputValue().catch(() => '')).length, { timeout: 10_000 })
			.toBeGreaterThan(0);
		await expect(page.getByTestId('chat-send-button').first()).toBeEnabled({ timeout: 10_000 });

		await emojiToggle.click();
		const closePicker = page.getByRole('button', { name: 'Close emoji picker' }).first();
		await expect(closePicker).toBeVisible({ timeout: 10_000 });
		await closePicker.click();
		await expect(closePicker).toBeHidden({ timeout: 10_000 });
	});
});
