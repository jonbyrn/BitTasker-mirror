import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';
import { requireMobileSafari } from './utils/ios-interactions';

async function gotoWallet(page: import('@playwright/test').Page): Promise<void> {
	const receiveTrigger = page.getByTestId('wallet-receive-trigger').first();
	const sendTrigger = page.getByTestId('wallet-send-trigger').first();
	const walletNav = page.locator("a[href='/dashboard/wallet']").first();

	for (let attempt = 0; attempt < 3; attempt += 1) {
		await page.goto('/dashboard/wallet', { waitUntil: 'domcontentloaded' }).catch(() => {});
		if (
			(await receiveTrigger.isVisible().catch(() => false)) ||
			(await sendTrigger.isVisible().catch(() => false))
		) {
			return;
		}

		if (await walletNav.isVisible().catch(() => false)) {
			await walletNav.click({ force: true }).catch(() => {});
			if (
				(await receiveTrigger.isVisible().catch(() => false)) ||
				(await sendTrigger.isVisible().catch(() => false))
			) {
				return;
			}
		}
	}

	await expect
		.poll(
			async () =>
				(await receiveTrigger.isVisible().catch(() => false)) ||
				(await sendTrigger.isVisible().catch(() => false)),
			{ timeout: 20_000, intervals: [250, 500, 1000, 1500] }
		)
		.toBe(true);
}

test.describe('iOS wallet modal interaction regressions', () => {
	test.describe.configure({ timeout: 90_000, retries: 0 });
	test.use({ credentialLabel: 'signup' });
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);

	test('receive flow opens nested payment request modal and can close cleanly', async ({
		authenticatedPageCrossBrowser
	}, testInfo) => {
		requireMobileSafari(testInfo);
		const page = authenticatedPageCrossBrowser;

		await page.setViewportSize({ width: 900, height: 1200 });
		await gotoWallet(page);

		const receiveTrigger = page.getByTestId('wallet-receive-trigger').first();
		await expect(receiveTrigger).toBeVisible({ timeout: 20_000 });
		await receiveTrigger.click();

		const receiveModal = page.getByTestId('wallet-receive-modal').first();
		await expect(receiveModal).toBeVisible({ timeout: 12_000 });

		const initializationError = receiveModal
			.getByText(/initialization failed|wallet.error.initialization_failed/i)
			.first();
		await expect(initializationError).toBeHidden({ timeout: 12_000 });

		await receiveModal.locator('button.collapse-title:visible').first().click();
		const rootstockOption = receiveModal
			.locator('.collapse-content button:has(img[src*="Bitcoin-Rootstock-logo"])')
			.first();
		await expect(rootstockOption).toBeVisible({ timeout: 8_000 });
		await expect(rootstockOption).toBeEnabled({ timeout: 8_000 });
		await rootstockOption.click();

		const oneKey = receiveModal.locator('.calculator-keypad button[aria-label="1"]').first();
		await expect(oneKey).toBeVisible({ timeout: 8_000 });
		await oneKey.click();

		const getPaid = page.getByTestId('wallet-receive-get-paid').first();
		await expect(getPaid).toBeEnabled({ timeout: 10_000 });
		await getPaid.click();

		const paymentRequestModal = page.getByTestId('wallet-payment-request-modal').first();
		await expect(paymentRequestModal).toBeVisible({ timeout: 20_000 });
		await expect(page.locator('img[alt="Payment QR Code"]').first()).toBeVisible({ timeout: 20_000 });

		await page.getByTestId('wallet-payment-request-modal-close').first().click();
		await expect(paymentRequestModal).toBeHidden({ timeout: 10_000 });
	});

	test('send modal allows switching to manual entry and validates invalid address', async ({
		authenticatedPageCrossBrowser
	}, testInfo) => {
		requireMobileSafari(testInfo);
		const page = authenticatedPageCrossBrowser;

		await page.setViewportSize({ width: 900, height: 1200 });
		await gotoWallet(page);

		const sendTrigger = page.getByTestId('wallet-send-trigger').first();
		await expect(sendTrigger).toBeVisible({ timeout: 20_000 });
		await sendTrigger.click();

		const sendModal = page.getByTestId('wallet-send-modal').first();
		await expect(sendModal).toBeVisible({ timeout: 12_000 });

		const enterTab = sendModal.getByRole('button', { name: /payment details/i }).first();
		await expect(enterTab).toBeVisible({ timeout: 10_000 });
		await enterTab.click();

		const recipientInput = sendModal.locator('[data-testid="wallet-send-address-input"]:visible').first();
		await expect(recipientInput).toBeVisible({ timeout: 10_000 });
		await expect(recipientInput).toBeEditable({ timeout: 10_000 });
		await recipientInput.fill('invalid-address-value');
		await recipientInput.blur();

		await expect(sendModal.locator('[data-testid="wallet-send-address-error"]:visible').first()).toBeVisible(
			{
				timeout: 10_000
			}
		);
	});
});
