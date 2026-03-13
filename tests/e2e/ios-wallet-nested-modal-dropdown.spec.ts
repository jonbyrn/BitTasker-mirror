import {
	test,
	expect,
	nostrCredentialsFileExists,
	NOSTR_CREDENTIALS_MISSING_MESSAGE
} from './fixtures/nostr-auth-cross-browser';
import { activate, requireMobileSafari } from './utils/ios-interactions';

async function gotoWallet(page: import('@playwright/test').Page): Promise<void> {
	const receiveTrigger = page.getByTestId('wallet-receive-trigger').first();
	const sendTrigger = page.getByTestId('wallet-send-trigger').first();
	const receiveFallback = page.getByRole('button', { name: /^receive$/i }).first();
	const sendFallback = page.getByRole('button', { name: /^send$/i }).first();
	const walletNav = page.locator("a[href='/dashboard/wallet']").first();

	for (let attempt = 0; attempt < 3; attempt += 1) {
		if (
			(await receiveTrigger.isVisible().catch(() => false)) ||
			(await sendTrigger.isVisible().catch(() => false)) ||
			(await receiveFallback.isVisible().catch(() => false)) ||
			(await sendFallback.isVisible().catch(() => false))
		) {
			return;
		}

		await page.goto('/dashboard/wallet', { waitUntil: 'load' }).catch(() => {});
		const reachedWalletDirectly = await expect
			.poll(() => page.url(), { timeout: 10_000, intervals: [250, 500, 1000, 2000] })
			.toMatch(/\/dashboard\/wallet(?:\?.*)?$/)
			.then(() => true)
			.catch(() => false);
		if (reachedWalletDirectly) {
			const walletShellReady = await expect
				.poll(
					async () =>
						(await receiveTrigger.isVisible().catch(() => false)) ||
						(await sendTrigger.isVisible().catch(() => false)) ||
						(await receiveFallback.isVisible().catch(() => false)) ||
						(await sendFallback.isVisible().catch(() => false)),
					{ timeout: 20_000, intervals: [250, 500, 1000, 1500] }
				)
				.toBe(true)
				.then(() => true)
				.catch(() => false);
			if (walletShellReady) {
				return;
			}
		}

		const walletNavVisible = await expect
			.poll(() => walletNav.isVisible().catch(() => false), {
				timeout: 12_000,
				intervals: [250, 500, 1000, 2000]
			})
			.toBe(true)
			.then(() => true)
			.catch(() => false);

		if (walletNavVisible) {
			await Promise.all([
				page.waitForURL(/\/dashboard\/wallet(?:\?.*)?$/, { timeout: 10_000 }),
				activate(walletNav).catch(async () => {
					await walletNav.click({ force: true }).catch(() => {});
				})
			]).catch(() => {});
		}
	}

	await expect
		.poll(
			async () =>
				(await receiveTrigger.isVisible().catch(() => false)) ||
				(await sendTrigger.isVisible().catch(() => false)) ||
				(await receiveFallback.isVisible().catch(() => false)) ||
				(await sendFallback.isVisible().catch(() => false)),
			{ timeout: 20_000, intervals: [250, 500, 1000, 1500] }
		)
		.toBe(true);
}

test.describe('iOS wallet modal interaction regressions', () => {
	test.describe.configure({ timeout: 90_000, retries: 0 });
	test.use({ credentialLabel: 'nostr', nostrCredentialLabel: 'nostr' });
	test.skip(() => !nostrCredentialsFileExists(), NOSTR_CREDENTIALS_MISSING_MESSAGE);

	test('receive flow opens nested payment request modal and can close cleanly', async ({
		authenticatedPageNostrCrossBrowser
	}, testInfo) => {
		requireMobileSafari(testInfo);
		const page = authenticatedPageNostrCrossBrowser;

		await page.setViewportSize({ width: 900, height: 1200 });
		await gotoWallet(page);

		const receiveTrigger = page
			.getByTestId('wallet-receive-trigger')
			.or(page.getByRole('button', { name: /^receive$/i }))
			.first();
		await expect(receiveTrigger).toBeVisible({ timeout: 20_000 });
		await activate(receiveTrigger);

		const receiveModal = page.getByTestId('wallet-receive-modal').first();
		await expect(receiveModal).toBeVisible({ timeout: 12_000 });

		const initializationError = receiveModal
			.getByText(/initialization failed|wallet.error.initialization_failed/i)
			.first();
		await expect(initializationError).toBeHidden({ timeout: 12_000 });

		const rootstockOption = receiveModal
			.getByRole('button', { name: /rootstock bitcoin/i })
			.first();
		await expect(rootstockOption).toBeVisible({ timeout: 8_000 });
		await expect(rootstockOption).toBeEnabled({ timeout: 8_000 });
		await activate(rootstockOption);

		const oneKey = receiveModal.locator('.calculator-keypad button[aria-label="1"]').first();
		await expect(oneKey).toBeVisible({ timeout: 8_000 });
		await activate(oneKey);

		const getPaid = page
			.getByTestId('wallet-receive-get-paid')
			.or(receiveModal.getByRole('button', { name: /get paid/i }))
			.first();
		await expect(getPaid).toBeEnabled({ timeout: 10_000 });
		await activate(getPaid);

		const paymentRequestModal = page.getByTestId('wallet-payment-request-modal').first();
		await expect(paymentRequestModal).toBeVisible({ timeout: 20_000 });
		await expect(page.locator('img[alt="Payment QR Code"]').first()).toBeVisible({
			timeout: 20_000
		});

		await page.getByTestId('wallet-payment-request-modal-close').first().click();
		await expect(paymentRequestModal).toBeHidden({ timeout: 10_000 });
	});

	test('send modal allows switching to manual entry and validates invalid address', async ({
		authenticatedPageNostrCrossBrowser
	}, testInfo) => {
		requireMobileSafari(testInfo);
		const page = authenticatedPageNostrCrossBrowser;

		await page.setViewportSize({ width: 900, height: 1200 });
		await gotoWallet(page);

		const sendTrigger = page
			.getByTestId('wallet-send-trigger')
			.or(page.getByRole('button', { name: /^send$/i }))
			.first();
		await expect(sendTrigger).toBeVisible({ timeout: 20_000 });
		await activate(sendTrigger);

		const sendModal = page.getByTestId('wallet-send-modal').first();
		await expect(sendModal).toBeVisible({ timeout: 12_000 });

		const enterTab = sendModal.getByRole('button', { name: /payment details/i }).first();
		await expect(enterTab).toBeVisible({ timeout: 10_000 });
		await enterTab.click();

		const recipientInput = sendModal
			.locator('[data-testid="wallet-send-address-input"]:visible')
			.first();
		await expect(recipientInput).toBeVisible({ timeout: 10_000 });
		await expect(recipientInput).toBeEditable({ timeout: 10_000 });
		await recipientInput.fill('invalid-address-value');
		await recipientInput.blur();

		await expect(
			sendModal.locator('[data-testid="wallet-send-address-error"]:visible').first()
		).toBeVisible({
			timeout: 10_000
		});
	});
});
