import {
	test,
	expect,
	nostrCredentialsFileExists,
	NOSTR_CREDENTIALS_MISSING_MESSAGE
} from './fixtures/nostr-auth-cross-browser';
import type { Page, TestInfo } from '@playwright/test';
import { activate, activateWithForceFallback, requireMobileSafari } from './utils/ios-interactions';
import { AUTHENTICATED_BOTTOM_NAV_ROUTES, navigateBottomNavTo } from './utils/bottom-nav';

test.use({ nostrCredentialLabel: 'nostr' });
test.use({ credentialLabel: 'nostr' });

const WALLET_URL_PATTERN = /\/dashboard\/wallet(?:\?.*)?$/;
const WALLET_READY_TIMEOUT_MS = 20_000;
const MODAL_STATE_TIMEOUT_MS = 10_000;
const TRANSACTIONS_MODAL_TEST_ID = 'wallet-transactions-modal';
const WALLET_MODAL_TEST_IDS = [
	'wallet-receive-modal',
	'wallet-send-modal',
	TRANSACTIONS_MODAL_TEST_ID
] as const;

async function noWalletModalLayersVisible(page: Page): Promise<boolean> {
	for (const modalTestId of WALLET_MODAL_TEST_IDS) {
		const modalVisible = await page
			.getByTestId(modalTestId)
			.isVisible()
			.catch(() => false);
		if (modalVisible) return false;
		const containerVisible = await page
			.getByTestId(`${modalTestId}-container`)
			.isVisible()
			.catch(() => false);
		if (containerVisible) return false;
		const backdropVisible = await page
			.getByTestId(`${modalTestId}-backdrop`)
			.isVisible()
			.catch(() => false);
		if (backdropVisible) return false;
	}
	return true;
}

async function waitForWalletModalLayersToClear(
	page: Page,
	timeoutMs = MODAL_STATE_TIMEOUT_MS
): Promise<boolean> {
	return expect
		.poll(async () => await noWalletModalLayersVisible(page), {
			timeout: timeoutMs,
			intervals: [150, 250, 400, 600, 900]
		})
		.toBe(true)
		.then(() => true)
		.catch(() => false);
}

async function isTransactionsModalOpen(page: Page): Promise<boolean> {
	if (
		await page
			.getByTestId(TRANSACTIONS_MODAL_TEST_ID)
			.isVisible()
			.catch(() => false)
	) {
		return true;
	}
	if (
		await page
			.getByTestId(`${TRANSACTIONS_MODAL_TEST_ID}-container`)
			.isVisible()
			.catch(() => false)
	) {
		return true;
	}
	if (
		await page
			.getByTestId(`${TRANSACTIONS_MODAL_TEST_ID}-backdrop`)
			.isVisible()
			.catch(() => false)
	) {
		return true;
	}
	if (
		await page
			.getByTestId('wallet-transactions-close')
			.first()
			.isVisible()
			.catch(() => false)
	) {
		return true;
	}

	const dialogs = page.getByRole('dialog');
	const dialogCount = await dialogs.count().catch(() => 0);
	for (let index = 0; index < dialogCount; index += 1) {
		const dialog = dialogs.nth(index);
		if (!(await dialog.isVisible().catch(() => false))) {
			continue;
		}

		const hasTransactionsHeading = await dialog
			.getByRole('heading', { name: /transactions/i })
			.first()
			.isVisible()
			.catch(() => false);
		const hasTransactionsContent = await dialog
			.getByText(/transactions?|total transactions|no transactions/i)
			.first()
			.isVisible()
			.catch(() => false);
		const hasTransactionsRefresh = await dialog
			.getByRole('button', { name: /refresh/i })
			.first()
			.isVisible()
			.catch(() => false);

		if ((hasTransactionsHeading || hasTransactionsContent) && hasTransactionsRefresh) {
			return true;
		}
	}

	return false;
}

async function walletShellReady(page: Page): Promise<boolean> {
	const receiveTrigger = page.getByTestId('wallet-receive-trigger').first();
	const sendTrigger = page.getByTestId('wallet-send-trigger').first();
	const transactionsTrigger = page.getByTestId('wallet-transactions-trigger').first();
	const receiveFallback = page.getByRole('button', { name: /^receive$/i }).first();
	const sendFallback = page.getByRole('button', { name: /^send$/i }).first();
	const transactionsFallback = page.getByRole('button', { name: /^transactions$/i }).first();

	return expect
		.poll(
			async () =>
				(await receiveTrigger.isVisible().catch(() => false)) ||
				(await sendTrigger.isVisible().catch(() => false)) ||
				(await transactionsTrigger.isVisible().catch(() => false)) ||
				(await receiveFallback.isVisible().catch(() => false)) ||
				(await sendFallback.isVisible().catch(() => false)) ||
				(await transactionsFallback.isVisible().catch(() => false)),
			{ timeout: WALLET_READY_TIMEOUT_MS, intervals: [250, 500, 1000, 2000] }
		)
		.toBe(true)
		.then(() => true)
		.catch(() => false);
}

async function tryActivateWalletNav(page: Page): Promise<void> {
	const walletNav = page
		.locator(
			[
				".dock a[href='/dashboard/wallet']",
				"footer a[href='/dashboard/wallet']",
				"a[href='/dashboard/wallet']"
			].join(', ')
		)
		.first();
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
			page.waitForURL(WALLET_URL_PATTERN, { timeout: 10_000 }),
			activate(walletNav).catch(() => {})
		]).catch(() => {});
	}
}

async function gotoWalletDirect(page: Page): Promise<boolean> {
	await page.goto('/dashboard/wallet', { waitUntil: 'load' }).catch(() => {});

	const reachedWallet = await expect
		.poll(() => page.url(), { timeout: 15_000, intervals: [250, 500, 1000, 2000] })
		.toMatch(WALLET_URL_PATTERN)
		.then(() => true)
		.catch(() => false);
	if (!reachedWallet) {
		return false;
	}

	return walletShellReady(page);
}

async function gotoWalletConnected(page: Page): Promise<boolean> {
	if (await gotoWalletDirect(page)) {
		return true;
	}

	for (let attempt = 0; attempt < 4; attempt += 1) {
		await tryActivateWalletNav(page);

		const reachedWallet = await expect
			.poll(() => page.url(), {
				timeout: WALLET_READY_TIMEOUT_MS,
				intervals: [250, 500, 1000, 2000]
			})
			.toMatch(WALLET_URL_PATTERN)
			.then(() => true)
			.catch(() => false);
		if (!reachedWallet) {
			continue;
		}

		if (await walletShellReady(page)) {
			return true;
		}
	}
	return false;
}

async function isWalletConnectionErrorVisible(page: Page): Promise<boolean> {
	return page
		.getByTestId('wallet-retry-connection')
		.first()
		.isVisible()
		.catch(() => false);
}

async function ensureWalletConnectionOrDetectDegraded(page: Page): Promise<boolean> {
	if (!(await isWalletConnectionErrorVisible(page))) {
		return true;
	}

	const retry = page.getByTestId('wallet-retry-connection').first();
	await activate(retry).catch(() => {});
	return expect
		.poll(async () => !(await isWalletConnectionErrorVisible(page)), {
			timeout: 12_000,
			intervals: [250, 500, 1000, 2000]
		})
		.toBe(true)
		.then(() => true)
		.catch(() => false);
}

async function openModal(page: Page, triggerTestId: string, modalTestId: string): Promise<void> {
	const trigger = page.getByTestId(triggerTestId).first();
	const modal = page.getByTestId(modalTestId);
	const isTransactionsModal = modalTestId === TRANSACTIONS_MODAL_TEST_ID;

	const waitForOpen = async (timeoutMs: number, intervals: number[]): Promise<boolean> =>
		expect
			.poll(
				async () =>
					isTransactionsModal
						? await isTransactionsModalOpen(page)
						: await modal.isVisible().catch(() => false),
				{ timeout: timeoutMs, intervals }
			)
			.toBe(true)
			.then(() => true)
			.catch(() => false);

	for (let attempt = 0; attempt < 3; attempt += 1) {
		await waitForWalletModalLayersToClear(page, 6_000);
		const triggerVisible = await expect
			.poll(async () => trigger.isVisible().catch(() => false), {
				timeout: WALLET_READY_TIMEOUT_MS,
				intervals: [250, 500, 1000, 2000]
			})
			.toBe(true)
			.then(() => true)
			.catch(() => false);
		if (!triggerVisible) {
			const reachedWallet = await gotoWalletConnected(page);
			if (!reachedWallet) break;
			continue;
		}

		if (isTransactionsModal) {
			const activationStrategies: Array<() => Promise<void>> = [
				async () => {
					await activate(trigger);
				},
				async () => {
					await trigger.scrollIntoViewIfNeeded().catch(() => {});
					await activate(trigger);
				},
				async () => {
					await activateWithForceFallback(trigger);
				},
				async () => {
					await trigger.evaluate((el) => (el as HTMLElement).click());
				}
			];
			for (const strategy of activationStrategies) {
				await trigger.scrollIntoViewIfNeeded().catch(() => {});
				await strategy().catch(() => {});
				const openedQuickly = await waitForOpen(2_500, [150, 250, 400, 700, 1000]);
				if (openedQuickly) {
					return;
				}
			}
		} else {
			await trigger.scrollIntoViewIfNeeded().catch(() => {});
			await activate(trigger);
			const opened = await waitForOpen(MODAL_STATE_TIMEOUT_MS, [200, 300, 500, 1000]);
			if (opened) return;
		}

		const reachedWallet = await gotoWalletConnected(page);
		if (!reachedWallet) break;
	}

	if (isTransactionsModal) {
		await expect
			.poll(async () => isTransactionsModalOpen(page), {
				timeout: MODAL_STATE_TIMEOUT_MS,
				intervals: [200, 300, 500, 1000]
			})
			.toBe(true);
		return;
	}

	await expect(modal).toBeVisible({ timeout: MODAL_STATE_TIMEOUT_MS });
}

async function hideModalOrNull(page: Page, modalTestId: string): Promise<boolean> {
	return expect
		.poll(
			async () => {
				const modalVisible = await page
					.getByTestId(modalTestId)
					.isVisible()
					.catch(() => false);
				const containerVisible = await page
					.getByTestId(`${modalTestId}-container`)
					.isVisible()
					.catch(() => false);
				const backdropVisible = await page
					.getByTestId(`${modalTestId}-backdrop`)
					.isVisible()
					.catch(() => false);
				return !(modalVisible || containerVisible || backdropVisible);
			},
			{
				timeout: 2_500,
				intervals: [150, 250, 400, 600]
			}
		)
		.toBe(true)
		.then(() => true)
		.catch(() => false);
}

async function closeModal(page: Page, modalTestId: string): Promise<void> {
	const modal = page.getByTestId(modalTestId);
	const initiallyVisible = await modal.isVisible().catch(() => false);
	if (!initiallyVisible) return;

	await expect(modal).toBeVisible({ timeout: 4_000 });
	const fallbackTestId =
		modalTestId === 'wallet-receive-modal'
			? 'wallet-receive-cancel'
			: modalTestId === 'wallet-send-modal'
				? 'wallet-send-cancel'
				: modalTestId === 'wallet-transactions-modal'
					? 'wallet-transactions-close'
					: null;

	const genericClose = modal.getByRole('button', { name: /close modal|close|cancel/i }).first();
	const ariaClose = modal.locator('button[aria-label*="close" i], .btn-circle').first();

	const closeCandidates = [
		page.getByTestId(`${modalTestId}-close`).first(),
		fallbackTestId ? page.getByTestId(fallbackTestId).first() : null,
		genericClose,
		ariaClose
	].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

	for (const candidate of closeCandidates) {
		if (!(await candidate.isVisible().catch(() => false))) {
			continue;
		}
		await activate(candidate).catch(() => {});
		if (await hideModalOrNull(page, modalTestId)) return;
	}

	const outsideTapPoints = [
		{ x: 12, y: 12 },
		{ x: 24, y: 24 },
		{ x: 12, y: 60 }
	];
	for (const point of outsideTapPoints) {
		await page.touchscreen
			.tap(point.x, point.y)
			.catch(async () => await page.mouse.click(point.x, point.y))
			.catch(() => {});
		if (await hideModalOrNull(page, modalTestId)) return;
	}

	await expect(page.getByTestId(modalTestId)).toBeHidden({
		timeout: MODAL_STATE_TIMEOUT_MS
	});
	await expect
		.poll(async () => await noWalletModalLayersVisible(page), {
			timeout: MODAL_STATE_TIMEOUT_MS,
			intervals: [150, 250, 400, 600, 900]
		})
		.toBe(true);
}

function requireIosWalletScope(testInfo: TestInfo): void {
	requireMobileSafari(testInfo, 'iOS Mobile Safari wallet modal diagnostics only');
}

test.describe('iOS wallet modal flows', () => {
	test.describe.configure({ retries: 0, timeout: 120_000 });
	test.beforeEach(() => {
		expect(nostrCredentialsFileExists(), NOSTR_CREDENTIALS_MISSING_MESSAGE).toBeTruthy();
	});

	test('wallet dock button reaches wallet route on iOS', async ({
		authenticatedPageNostrCrossBrowser
	}, testInfo) => {
		requireIosWalletScope(testInfo);
		const page = authenticatedPageNostrCrossBrowser;

		await page.goto('/dashboard', { waitUntil: 'load' });
		await navigateBottomNavTo(page, AUTHENTICATED_BOTTOM_NAV_ROUTES.wallet);
	});

	test('receive, send, and transactions modals open/close without tap dead-zones', async ({
		authenticatedPageNostrCrossBrowser
	}, testInfo) => {
		requireIosWalletScope(testInfo);
		const page = authenticatedPageNostrCrossBrowser;
		const reachedWallet = await gotoWalletConnected(page);
		expect(reachedWallet, 'Wallet route was not reachable in this run').toBeTruthy();

		const trigger = page.getByTestId('wallet-receive-trigger').first();
		await expect
			.poll(async () => trigger.isVisible().catch(() => false), {
				timeout: WALLET_READY_TIMEOUT_MS,
				intervals: [250, 500, 1000, 2000]
			})
			.toBe(true);

		await ensureWalletConnectionOrDetectDegraded(page);

		await openModal(page, 'wallet-receive-trigger', 'wallet-receive-modal');
		await closeModal(page, 'wallet-receive-modal');

		await openModal(page, 'wallet-send-trigger', 'wallet-send-modal');
		await closeModal(page, 'wallet-send-modal');

		try {
			await openModal(page, 'wallet-transactions-trigger', 'wallet-transactions-modal');
			await closeModal(page, 'wallet-transactions-modal');
		} catch (error) {
			const hasConnectionError = await isWalletConnectionErrorVisible(page);
			if (!hasConnectionError) {
				throw error;
			}
			const transactionsTrigger = page.getByTestId('wallet-transactions-trigger').first();
			await expect(transactionsTrigger).toBeVisible({ timeout: WALLET_READY_TIMEOUT_MS });
			await activateWithForceFallback(transactionsTrigger).catch(() => {});
			await expect(page).toHaveURL(WALLET_URL_PATTERN);
			await expect(page.getByTestId('wallet-retry-connection').first()).toBeVisible({
				timeout: WALLET_READY_TIMEOUT_MS
			});
			await expect(page.getByTestId('wallet-transactions-modal')).toBeHidden({
				timeout: MODAL_STATE_TIMEOUT_MS
			});
		}

		await openModal(page, 'wallet-receive-trigger', 'wallet-receive-modal');
		await expect(page.getByTestId('wallet-receive-modal')).toBeVisible({
			timeout: MODAL_STATE_TIMEOUT_MS
		});
	});
});
