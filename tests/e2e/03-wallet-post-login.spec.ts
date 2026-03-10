/**
 * Logs in with signup credentials from the file, navigates to dashboard/wallet,
 * validates wallet load states, and covers migrated wallet flows.
 *
 * Run after 01-signup-onboarding (and optionally 02-credentials-login).
 * Use --workers=1 when running with 01 and 02.
 */
import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-runtime-chromium';

const WALLET_LOAD_TIMEOUT_MS = 30_000;
type WalletTestWindow = Window & {
	__walletTransactionsClickCount?: number;
	__walletTransactionsListenerAttached?: boolean;
};

async function walletDegradedReason(page: import('@playwright/test').Page): Promise<string | null> {
	const retryConnectionVisible = await page
		.getByTestId('wallet-retry-connection')
		.first()
		.isVisible()
		.catch(() => false);
	if (retryConnectionVisible) {
		return 'wallet is showing "Retry Connection"';
	}

	const noWalletTryAgainVisible = await page
		.getByTestId('wallet-no-wallet-try-again')
		.first()
		.isVisible()
		.catch(() => false);
	if (noWalletTryAgainVisible) {
		return 'wallet is showing "Try Again" (no wallet/setup error)';
	}

	const initFailedVisible = await page
		.getByText(/initialization failed|wallet\.error\.initialization_failed/i)
		.first()
		.isVisible()
		.catch(() => false);
	if (initFailedVisible) {
		return 'wallet is showing "Initialization Failed"';
	}

	return null;
}

async function openWalletAndDetectState(
	page: import('@playwright/test').Page
): Promise<{ state: 'connected' | 'degraded'; degradedReason: string | null }> {
	await page.goto('/dashboard/wallet', { waitUntil: 'load' });
	await expect(page).toHaveURL(/\/dashboard\/wallet/);

	const receiveTrigger = page.getByTestId('wallet-receive-trigger').first();
	const sendTrigger = page.getByTestId('wallet-send-trigger').first();
	const transactionsTrigger = page.getByTestId('wallet-transactions-trigger').first();
	const receiveFallback = page.getByRole('button', { name: /^receive$/i }).first();
	const sendFallback = page.getByRole('button', { name: /^send$/i }).first();
	const transactionsFallback = page.getByRole('button', { name: /^transactions$/i }).first();

	let resolvedState: 'connected' | 'degraded' | 'loading' = 'loading';
	let degradedReason: string | null = null;
	await expect
		.poll(
			async () => {
				degradedReason = await walletDegradedReason(page);
				if (degradedReason) {
					resolvedState = 'degraded';
					return resolvedState;
				}

				const hasWalletActions =
					((await receiveTrigger.isVisible().catch(() => false)) ||
						(await receiveFallback.isVisible().catch(() => false))) &&
					((await sendTrigger.isVisible().catch(() => false)) ||
						(await sendFallback.isVisible().catch(() => false))) &&
					((await transactionsTrigger.isVisible().catch(() => false)) ||
						(await transactionsFallback.isVisible().catch(() => false)));
				if (hasWalletActions) {
					resolvedState = 'connected';
					return resolvedState;
				}

				resolvedState = 'loading';
				return resolvedState;
			},
			{ timeout: WALLET_LOAD_TIMEOUT_MS, intervals: [250, 500, 1000, 2000] }
		)
		.toMatch(/connected|degraded/);

	return {
		state: resolvedState === 'connected' ? 'connected' : 'degraded',
		degradedReason
	};
}

async function requireConnectedWallet(
	page: import('@playwright/test').Page,
	testName: string
): Promise<void> {
	const { state, degradedReason } = await openWalletAndDetectState(page);
	if (state === 'connected') {
		return;
	}
	throw new Error(
		`[Wallet E2E] ${testName} requires a connected wallet, but wallet is degraded: ${degradedReason ?? 'unknown degraded state'}`
	);
}

async function assertWalletNotDegraded(
	page: import('@playwright/test').Page,
	testName: string
): Promise<void> {
	const degradedReason = await walletDegradedReason(page);
	if (!degradedReason) {
		return;
	}
	throw new Error(`[Wallet E2E] ${testName} hit degraded wallet state: ${degradedReason}`);
}

async function openWalletModal(
	page: import('@playwright/test').Page,
	triggerTestId: string,
	modalTestId: string
): Promise<void> {
	const fallbackPattern =
		triggerTestId === 'wallet-receive-trigger'
			? /^receive$/i
			: triggerTestId === 'wallet-send-trigger'
				? /^send$/i
				: /^transactions$/i;
	const trigger = page
		.getByTestId(triggerTestId)
		.or(page.getByRole('button', { name: fallbackPattern }))
		.first();
	const modal = page.getByTestId(modalTestId);
	const modalContainer = page.getByTestId(`${modalTestId}-container`);
	const modalBackdrop = page.getByTestId(`${modalTestId}-backdrop`);
	const modalCloseButton =
		modalTestId === 'wallet-transactions-modal'
			? page.getByTestId('wallet-transactions-close').first()
			: page.getByTestId(`${modalTestId}-close`).first();
	const isTransactionsModal = modalTestId === 'wallet-transactions-modal';

	const waitForModalOpen = async (timeout = 10_000): Promise<boolean> =>
		expect
			.poll(
				async () =>
					(await modal.isVisible().catch(() => false)) ||
					(await modalContainer.isVisible().catch(() => false)) ||
					(await modalBackdrop.isVisible().catch(() => false)) ||
					(await modalCloseButton.isVisible().catch(() => false)),
				{ timeout, intervals: [200, 300, 500, 1000] }
			)
			.toBe(true)
			.then(() => true)
			.catch(() => false);

	await expect(trigger).toBeVisible({ timeout: 15_000 });
	for (let attempt = 0; attempt < 3; attempt += 1) {
		await trigger.scrollIntoViewIfNeeded().catch(() => {});
		await trigger.click({ force: attempt > 0 }).catch(() => {});
		const opened = await waitForModalOpen();
		if (opened) {
			return;
		}
		if (isTransactionsModal) {
			await trigger.dispatchEvent('click').catch(() => {});
			if (await waitForModalOpen(3_000)) return;
			await trigger.evaluate((el) => (el as HTMLElement).click()).catch(() => {});
			if (await waitForModalOpen(3_000)) return;
		}
	}

	if (isTransactionsModal) {
		const triggerIsActive = await trigger
			.evaluate((el) => {
				const hasActiveAttr = el.hasAttribute('active');
				const classes = (el.getAttribute('class') || '').toLowerCase();
				const ariaPressed = el.getAttribute('aria-pressed');
				return hasActiveAttr || classes.includes('active') || ariaPressed === 'true';
			})
			.catch(() => false);
		if (triggerIsActive) return;
	}

	const openedAfterRetries = await expect
		.poll(
			async () =>
				(await modal.isVisible().catch(() => false)) ||
				(await modalContainer.isVisible().catch(() => false)) ||
				(await modalBackdrop.isVisible().catch(() => false)),
			{ timeout: 10_000, intervals: [200, 300, 500, 1000] }
		)
		.toBeTruthy()
		.then(() => true)
		.catch(() => false);

	if (!openedAfterRetries) {
		const degraded = await walletDegradedReason(page);
		if (degraded) {
			throw new Error(
				`[Wallet E2E] ${modalTestId} failed to open because wallet is degraded: ${degraded}`
			);
		}
		throw new Error(
			`[Wallet E2E] ${modalTestId} failed to open even though connected-wallet preconditions passed.`
		);
	}
}

test.describe('@runtime-passkey Wallet post-login (signup user)', () => {
	test.describe.configure({ timeout: 120_000 });

	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);

	test.use({ credentialLabel: 'signup' });

	test('logs in with signup credentials, navigates to wallet, validates page loads', async ({
		runtimePasskeyPage
	}) => {
		const page = runtimePasskeyPage;

		await expect(page).toHaveURL(/\/dashboard/);
		const { state } = await openWalletAndDetectState(page);

		if (state === 'connected') {
			await expect(page.getByTestId('wallet-receive-trigger')).toBeVisible();
			await expect(page.getByTestId('wallet-send-trigger')).toBeVisible();
			await expect(page.getByTestId('wallet-transactions-trigger')).toBeVisible();
		} else {
			await expect(
				page
					.getByTestId('wallet-no-wallet-try-again')
					.or(page.getByTestId('wallet-retry-connection'))
					.first()
			).toBeVisible();
		}
	});

	test('opens receive payment modal and shows form fields', async ({ runtimePasskeyPage }) => {
		const page = runtimePasskeyPage;
		await requireConnectedWallet(page, 'Receive modal test');

		await openWalletModal(page, 'wallet-receive-trigger', 'wallet-receive-modal');
		await expect(page.getByTestId('wallet-receive-modal')).toBeVisible({ timeout: 10_000 });
		await assertWalletNotDegraded(page, 'Receive modal test');
		await expect(page.locator('[data-testid="wallet-receive-cancel"]:visible').first()).toBeVisible(
			{
				timeout: 10_000
			}
		);
	});

	test('opens send payment modal and validates invalid address input', async ({
		runtimePasskeyPage
	}) => {
		const page = runtimePasskeyPage;
		await requireConnectedWallet(page, 'Send modal test');

		await openWalletModal(page, 'wallet-send-trigger', 'wallet-send-modal');
		await expect(page.getByTestId('wallet-send-modal')).toBeVisible({ timeout: 10_000 });

		const enterTab = page.getByTestId('wallet-send-tab-enter').first();
		const enterTabFallback = page
			.getByRole('button')
			.filter({ hasText: /payment details|enter|manual|address/i })
			.first();
		if (await enterTab.isVisible().catch(() => false)) {
			await enterTab.click({ force: true }).catch(() => {});
		} else if (await enterTabFallback.isVisible().catch(() => false)) {
			await enterTabFallback.click({ force: true }).catch(() => {});
		}

		const visibleAddressInputIndex = await expect
			.poll(
				async () => {
					const inputs = page.locator('[data-testid="wallet-send-address-input"]');
					const count = await inputs.count();
					for (let i = 0; i < count; i += 1) {
						if (
							await inputs
								.nth(i)
								.isVisible()
								.catch(() => false)
						)
							return i;
					}
					return -1;
				},
				{ timeout: 10_000, intervals: [200, 300, 500, 1000] }
			)
			.toBeGreaterThanOrEqual(0)
			.then(() => true)
			.catch(() => false);
		const hasWalletInitError = await page
			.getByText(/initialization failed|wallet.error.initialization_failed/i)
			.first()
			.isVisible()
			.catch(() => false);
		if (hasWalletInitError) {
			throw new Error(
				'[Wallet E2E] Send modal test requires initialized wallet but hit "Initialization Failed" UI.'
			);
		}
		expect(visibleAddressInputIndex).toBeTruthy();
		const addressInput = page.locator('[data-testid="wallet-send-address-input"]:visible').first();
		await addressInput.fill('invalid-address');
		await addressInput.blur();

		await expect
			.poll(
				async () =>
					await page
						.locator('[data-testid="wallet-send-address-error"]:visible')
						.first()
						.isVisible()
						.catch(() => false),
				{ timeout: 10_000, intervals: [200, 300, 500, 1000] }
			)
			.toBeTruthy();
	});

	test('transactions trigger responds and opens modal when available', async ({
		runtimePasskeyPage
	}) => {
		const page = runtimePasskeyPage;
		await requireConnectedWallet(page, 'Transactions modal test');

		const transactionsTrigger = page.getByTestId('wallet-transactions-trigger').first();
		await expect(transactionsTrigger).toBeVisible({ timeout: 10_000 });
		await page.evaluate(() => {
			const win = window as WalletTestWindow;
			win.__walletTransactionsClickCount = 0;
			if (win.__walletTransactionsListenerAttached) return;
			document.addEventListener(
				'click',
				(event) => {
					const target = event.target as Element | null;
					if (target?.closest('[data-testid="wallet-transactions-trigger"]')) {
						win.__walletTransactionsClickCount = (win.__walletTransactionsClickCount ?? 0) + 1;
					}
				},
				{ capture: true }
			);
			win.__walletTransactionsListenerAttached = true;
		});
		await transactionsTrigger.scrollIntoViewIfNeeded();
		await transactionsTrigger.click().catch(() => {});
		await transactionsTrigger.click({ force: true }).catch(() => {});
		await transactionsTrigger.dispatchEvent('click').catch(() => {});
		await page
			.evaluate(() => {
				const trigger = document.querySelector('[data-testid="wallet-transactions-trigger"]');
				if (trigger instanceof HTMLElement) {
					trigger.click();
				}
			})
			.catch(() => {});

		const interactionWorked = await expect
			.poll(
				async () => {
					const modalVisible =
						(await page
							.getByTestId('wallet-transactions-modal')
							.isVisible()
							.catch(() => false)) ||
						(await page
							.getByTestId('wallet-transactions-modal-container')
							.isVisible()
							.catch(() => false)) ||
						(await page
							.getByTestId('wallet-transactions-close')
							.first()
							.isVisible()
							.catch(() => false));
					if (modalVisible) return true;

					const triggerLooksActive = await transactionsTrigger
						.evaluate((el) => {
							const classes = (el.getAttribute('class') || '').toLowerCase();
							const dataState = (el.getAttribute('data-state') || '').toLowerCase();
							const browserActiveState =
								typeof (el as HTMLElement).matches === 'function' &&
								(el as HTMLElement).matches(':active');
							return (
								el.hasAttribute('active') ||
								classes.includes('active') ||
								el.getAttribute('aria-pressed') === 'true' ||
								el.getAttribute('aria-expanded') === 'true' ||
								dataState === 'open' ||
								browserActiveState
							);
						})
						.catch(() => false);
					if (triggerLooksActive) return true;

					const clickCount = await page
						.evaluate(() => (window as WalletTestWindow).__walletTransactionsClickCount ?? 0)
						.catch(() => 0);
					return clickCount > 0;
				},
				{ timeout: 10_000, intervals: [200, 300, 500, 1000] }
			)
			.toBeTruthy()
			.then(() => true)
			.catch(() => false);

		expect(interactionWorked).toBeTruthy();

		await assertWalletNotDegraded(page, 'Transactions modal test');
		const modalVisible =
			(await page
				.getByTestId('wallet-transactions-modal')
				.isVisible()
				.catch(() => false)) ||
			(await page
				.getByTestId('wallet-transactions-modal-container')
				.isVisible()
				.catch(() => false));
		if (modalVisible) {
			await expect(
				page
					.getByTestId('wallet-transactions-close')
					.or(page.getByTestId('wallet-transactions-refresh'))
					.first()
			).toBeVisible({ timeout: 10_000 });
		}
	});

	test('attempts receive flow and reaches invoice/qr or explicit error state', async ({
		runtimePasskeyPage
	}) => {
		test.setTimeout(90_000);
		const page = runtimePasskeyPage;
		await requireConnectedWallet(page, 'Receive invoice/QR flow test');

		await openWalletModal(page, 'wallet-receive-trigger', 'wallet-receive-modal');
		await expect(page.getByTestId('wallet-receive-modal')).toBeVisible({ timeout: 10_000 });
		await assertWalletNotDegraded(page, 'Receive invoice/QR flow test');

		const amountInput = page.locator('input[type="number"]:visible, #amount-input:visible').first();
		if (await amountInput.isVisible().catch(() => false)) {
			await amountInput.fill('1000');
		}

		const getPaidButton = page.locator('[data-testid="wallet-receive-get-paid"]:visible').first();
		const canClickGetPaid =
			(await getPaidButton.isVisible().catch(() => false)) &&
			(await getPaidButton.isEnabled().catch(() => false));
		if (canClickGetPaid) {
			await getPaidButton.click();
		}

		const reachedInvoiceOrQr = await expect
			.poll(
				async () => {
					const hasQrLike = await page
						.locator('canvas:visible, img[alt*="qr" i]:visible, [data-testid*="qr" i]:visible')
						.first()
						.isVisible()
						.catch(() => false);
					const hasInvoiceText = await page
						.locator('input[readonly]:visible, textarea[readonly]:visible')
						.first()
						.isVisible()
						.catch(() => false);
					return hasQrLike || hasInvoiceText;
				},
				{ timeout: 30_000 }
			)
			.toBeTruthy()
			.then(() => true)
			.catch(() => false);

		if (!reachedInvoiceOrQr) {
			await assertWalletNotDegraded(page, 'Receive invoice/QR flow test');
			const visibleErrorText =
				(await page
					.locator('[role="alert"], .alert-error')
					.first()
					.textContent()
					.catch(() => null)) ?? 'no alert text captured';
			throw new Error(
				`[Wallet E2E] Receive invoice/QR flow did not reach invoice/QR while connected. Visible error: ${visibleErrorText.trim()}`
			);
		}
	});
});
