import { test, expect } from '@playwright/test';
import { SimplePool } from 'nostr-tools';
import { inspectBotKeychains, signUpBot } from './fixtures/bot-auth';
import { fundTestnetAddress } from './fixtures/treasury';

test.use({ headless: false, launchOptions: { slowMo: 1_000 } });
test.describe.configure({ timeout: 600_000 });

const E2E_BASE_URL = process.env.PW_E2E_BASE_URL || 'http://localhost:3000';
const E2E_GENERAL_RELAY_URL = process.env.VITE_NOSTR_RELAY_URL || 'wss://relay1-dev.bittasker.com';
const E2E_TASK_RELAY_URL =
	process.env.VITE_NOSTR_TASK_RELAY_URL || 'wss://relay2-dev.bittasker.com';
const E2E_LOCAL_RELAY_URL = 'ws://localhost:7777';
/** Kind 31000 is published with VITE_NOSTR_RELAY_URL, plus the local e2e relay when Playwright is set. */
const E2E_TASK_PUBLISH_RELAYS = [
	...new Set([E2E_GENERAL_RELAY_URL, E2E_LOCAL_RELAY_URL, E2E_TASK_RELAY_URL])
];
const E2E_HOLD_OPEN_MS = Number(process.env.PW_E2E_HOLD_OPEN_MS ?? 0);
const TESTNET_CONFIRM_MS = 300_000;
const WALLET_CONNECT_MS = 10_000;
const WALLET_SYNC_MS = 60_000;

type LastPublishedTask = {
	dTag: string;
	clientHex: string;
	event: {
		id: string;
		kind: number;
		pubkey: string;
	};
};

type LastPublishedBid = {
	bidEventId: string;
	bidderHex: string;
	taskEventId: string;
	taskDTag: string;
};

type LastFundedContractWindow = Window & {
	__lastFundedContractId?: string;
	initWasm?: () => Promise<boolean>;
	__wasmReady?: boolean;
	__wasmLive?: boolean;
	__btcAddress?: string;
	__btcBalanceSats?: number;
	__btcUtxoCount?: number;
	__btcFingerprint?: string;
	__btcWalletSynced?: boolean;
	__connectWallet?: () => Promise<void>;
	__refreshBtcBalance?: () => Promise<void>;
};

type E2ETransfer = {
	idx?: number;
	status?: string | Record<string, unknown>;
	txid?: string;
	contractId?: string;
	recipientId?: string;
	kind?: string | Record<string, unknown>;
	assetId?: string;
};

type NiaRow = {
	assetId?: string;
	issuedSupply?: number | string;
	balance?: { spendable?: number };
};

type BrowserE2EWindow = Window & {
	__PLAYWRIGHT_TEST__?: boolean;
	__utexoWallet?: {
		refreshWallet: () => Promise<void>;
		listAssets: () => Promise<{ nia?: NiaRow[] }>;
		issueAssetNia: (params: {
			ticker: string;
			name: string;
			precision: number;
			amounts: number[];
		}) => Promise<{ assetId: string }>;
		listTransfers?: (assetId?: string) => Promise<E2ETransfer[]>;
		createUtxos?: (params: { upTo?: boolean; num?: number; feeRate?: number }) => Promise<number>;
		listUnspents?: () => Promise<
			Array<{
				rgbAllocations?: Array<{
					assetId?: string;
					assignment?: { type?: string; amount?: number };
				}>;
				utxo?: {
					exists?: boolean;
					colorable?: boolean;
					outpoint?: { txid?: string; vout?: number };
				};
			}>
		>;
		syncWallet?: () => Promise<void>;
		onchainReceive?: (params: {
			assetId?: string;
			amount?: number;
			witness?: boolean;
			minConfirmations?: number;
			durationSeconds?: number;
		}) => Promise<{ invoice?: string; recipientId?: string } | string>;
		blindReceive?: (params: {
			assetId?: string;
			amount?: number;
			durationSeconds?: number;
			minConfirmations?: number;
		}) => Promise<{ invoice?: string; recipientId?: string } | string>;
		signPsbt?: (psbt: string) => Promise<string>;
		onchainSendBegin?: (params: {
			invoice: string;
			assetId?: string;
			amount?: number;
			feeRate?: number;
			minConfirmations?: number;
		}) => Promise<string>;
		onchainSendEnd?: (params: { signedPsbt: string; skipSync?: boolean }) => Promise<unknown>;
	};
	__E2E_MINTED_ASSET_ID?: string;
	__E2E_SAFE_OUTPOINTS?: string[];
	__E2E_SPLIT_TXID?: string;
	__E2E_TRANSFERS?: E2ETransfer[];
	E2E?: {
		escrowStatus?: () => string;
		transfers?: (args: { assetId: string }) => Promise<unknown>;
		_refreshRgbWallet?: () => Promise<void>;
	};
	escrowStatus?: () => string;
	transfers?: (args: { assetId: string }) => Promise<unknown>;
	_refreshRgbWallet?: () => Promise<void>;
};

async function withRgbIdle<T>(
	page: import('@playwright/test').Page,
	fn: () => Promise<T>,
	tries = 15,
	delayMs = 2000
): Promise<T> {
	let lastError: unknown;
	for (let i = 0; i < tries; i++) {
		try {
			return await fn();
		} catch (err: unknown) {
			lastError = err;
			const msg = err instanceof Error ? err.message : String(err);
			if (
				msg.includes('busy') ||
				msg.includes('locked') ||
				msg.includes('mutex') ||
				msg.includes('not initialized')
			) {
				await page.waitForTimeout(delayMs);
				continue;
			}
			throw err;
		}
	}
	throw lastError;
}

async function countRelayEvents(
	pool: SimplePool,
	relays: string[],
	filter: { kinds: number[]; authors?: string[]; '#d'?: string[]; '#e'?: string[]; limit: number }
): Promise<number> {
	const counts = await Promise.all(
		relays.map(async (relay) => {
			try {
				const events = await pool.querySync([relay], filter);
				return events.length;
			} catch {
				return 0;
			}
		})
	);
	return counts.reduce((sum, count) => sum + count, 0);
}

async function waitForTaskOnRelay(taskD: string, clientHex: string): Promise<void> {
	console.info('[e2e] task relay query', E2E_TASK_PUBLISH_RELAYS.join(', '));
	const pool = new SimplePool();
	try {
		await expect
			.poll(
				async () =>
					countRelayEvents(pool, E2E_TASK_PUBLISH_RELAYS, {
						kinds: [31000],
						authors: [clientHex],
						'#d': [taskD],
						limit: 1
					}),
				{ timeout: 90_000, intervals: [1_000, 2_000, 5_000] }
			)
			.toBeGreaterThan(0);
	} finally {
		pool.close(E2E_TASK_PUBLISH_RELAYS);
	}
}

async function waitForBidOnRelay(taskEventId: string): Promise<void> {
	const pool = new SimplePool();
	try {
		await expect
			.poll(
				async () => {
					const events = await pool.querySync([E2E_TASK_RELAY_URL], {
						kinds: [30007],
						'#e': [taskEventId],
						limit: 10
					});
					return events.length;
				},
				{ timeout: 30_000, intervals: [500, 1_000, 2_000] }
			)
			.toBeGreaterThan(0);
	} finally {
		pool.close([E2E_TASK_RELAY_URL]);
	}
}

async function syncConnectedWallet(
	page: import('@playwright/test').Page,
	role: 'tasker' | 'taskee'
): Promise<void> {
	await page.waitForTimeout(WALLET_CONNECT_MS);
	await page.evaluate(async () => {
		const probe = window as LastFundedContractWindow;
		if (probe.__btcWalletSynced) return;
		if (typeof probe.__connectWallet === 'function') {
			await probe.__connectWallet();
		}
	});
	await expect
		.poll(
			async () =>
				page.evaluate(
					() =>
						Boolean((window as LastFundedContractWindow).__btcAddress) &&
						(window as LastFundedContractWindow).__btcWalletSynced === true
				),
			{ timeout: WALLET_SYNC_MS, intervals: [10_000] }
		)
		.toBe(true);
	if (/\/wallet(?:[/?#]|$)/.test(page.url())) {
		await expect(page.locator('[data-testid="wallet-connected"]')).toBeVisible({
			timeout: WALLET_SYNC_MS
		});
	}
	console.info(
		`[e2e-keychain:${role}]`,
		await page.evaluate(() => {
			const address = (window as LastFundedContractWindow).__btcAddress ?? '';
			return {
				addressPrefix: address.slice(0, 16),
				fingerprint: (window as LastFundedContractWindow).__btcFingerprint ?? '',
				balance: (window as LastFundedContractWindow).__btcBalanceSats ?? 0,
				utxos: (window as LastFundedContractWindow).__btcUtxoCount ?? 0,
				synced: (window as LastFundedContractWindow).__btcWalletSynced === true
			};
		})
	);
}

async function waitForConnectedWallet(
	page: import('@playwright/test').Page,
	role: 'tasker' | 'taskee'
): Promise<void> {
	await page.goto(new URL('/wallet', E2E_BASE_URL).toString(), { waitUntil: 'domcontentloaded' });
	await expect(page).toHaveURL(/\/wallet(?:[/?#]|$)/);
	await syncConnectedWallet(page, role);
}

async function waitForTaskerWallet(page: import('@playwright/test').Page): Promise<void> {
	await syncConnectedWallet(page, 'tasker');
}

async function readTaskerVanilla(page: import('@playwright/test').Page): Promise<{
	address: string;
	vanilla: number;
}> {
	return page.evaluate(async () => {
		const wallet = (
			window as {
				__utexoWallet?: {
					syncWallet?: () => Promise<void>;
					refreshWallet?: () => Promise<void>;
					getAddress?: () => Promise<string>;
					getBtcBalance?: () => Promise<{ vanilla?: { spendable?: number } }>;
				};
			}
		).__utexoWallet;
		if (wallet?.syncWallet) await wallet.syncWallet();
		if (wallet?.refreshWallet) await wallet.refreshWallet();
		const balance = wallet?.getBtcBalance ? await wallet.getBtcBalance() : null;
		const address = wallet?.getAddress
			? await wallet.getAddress()
			: ((window as { __btcAddress?: string }).__btcAddress ?? '');
		return { address, vanilla: Number(balance?.vanilla?.spendable ?? 0) };
	});
}

async function ensureTaskerSats(
	page: import('@playwright/test').Page,
	browser: import('@playwright/test').Browser,
	minSats: number
): Promise<void> {
	await waitForTaskerWallet(page);
	let snapshot = await readTaskerVanilla(page);
	if (snapshot.vanilla < minSats) {
		if (!snapshot.address.startsWith('tb1')) {
			throw new Error(`Tasker wallet address is not testnet: ${snapshot.address || '(empty)'}`);
		}
		const fundingTxid = await fundTestnetAddress(
			browser,
			snapshot.address,
			Math.max(minSats, 2_000) + 5_000
		);
		console.info('[e2e] treasury broadcast', fundingTxid);
	}
	await expect
		.poll(
			async () => {
				snapshot = await readTaskerVanilla(page);
				return snapshot.vanilla;
			},
			{ timeout: TESTNET_CONFIRM_MS, intervals: [5_000, 10_000] }
		)
		.toBeGreaterThanOrEqual(minSats);
}

async function holdOpenForInspection(): Promise<void> {
	if (!Number.isFinite(E2E_HOLD_OPEN_MS) || E2E_HOLD_OPEN_MS <= 0) return;
	await new Promise((resolve) => setTimeout(resolve, E2E_HOLD_OPEN_MS));
}

async function createTask(page: import('@playwright/test').Page): Promise<LastPublishedTask> {
	if (!/\/create-task(?:[/?#]|$)/.test(page.url())) {
		await expect(async () => {
			const res = await page.goto('/create-task', { waitUntil: 'domcontentloaded' });
			if (!res || res.status() >= 500) throw new Error('create-task not ready');
		}).toPass({ timeout: 60_000 });
	}

	await expect(page).toHaveURL(/\/create-task(?:[/?#]|$)/, { timeout: 60_000 });
	await expect(page.locator('[data-testid="task-create-form"]')).toBeVisible({ timeout: 60_000 });

	const titleInput = page.locator('[data-testid="task-title-input"]');
	for (let step = 0; step < 5 && !(await titleInput.isVisible()); step += 1) {
		const previousBtn = page.locator('[data-testid="previous-task-step-btn"]');
		if (await previousBtn.isVisible()) {
			await previousBtn.click();
		} else {
			break;
		}
	}
	await expect(titleInput).toBeVisible({ timeout: 60_000 });
	await titleInput.fill(`Bot smoke task ${Date.now()}`);

	const categoryInput = page.locator('[data-testid="task-category-input"] .multiselect-wrapper');
	if (await categoryInput.isVisible()) {
		await categoryInput.click();
		await page.locator('[data-testid="task-category-input"] .category-option').first().click();
	}

	const skillsInput = page.locator(
		'[data-testid="task-skills-input"] input:not([aria-hidden="true"])'
	);
	if (await skillsInput.isVisible()) {
		await skillsInput.fill('testing');
		await skillsInput.press('Enter');
	}

	const flexibleDateBtn = page.locator('[data-testid="flexible-date-btn"]');
	await expect(flexibleDateBtn).toBeVisible({ timeout: 15_000 });
	await flexibleDateBtn.click();
	await expect(page.locator('[data-testid="specific-date-btn"]')).toBeVisible();

	const nextBtn = page.locator('[data-testid="next-task-step-btn"]');
	if (await nextBtn.isVisible()) {
		await nextBtn.click();
	}

	const remoteBtn = page.locator('[data-testid="remote-task-btn"]');
	await expect(remoteBtn).toBeVisible({ timeout: 15_000 });
	await remoteBtn.click();
	await expect(page.locator('[data-testid="in-person-task-btn"]')).toBeVisible();
	await nextBtn.click();

	const budgetInput = page.locator('#budget-btc');
	if (await budgetInput.isVisible()) {
		await budgetInput.fill('100000');
	}

	const descInput = page.locator('[data-testid="task-description-input"]');
	if (await descInput.isVisible()) {
		await descInput.fill(
			'This task is created by the multi-user Playwright smoke test and needs a clear proposal.'
		);
		await nextBtn.click();
	}

	const submitBtn = page.locator('[data-testid="submit-task-btn"]');
	await expect(submitBtn).toBeVisible({ timeout: 15_000 });

	const readPublishedTask = () =>
		page.evaluate(() => {
			const fromWindow = (window as Window & { __lastPublishedTask?: LastPublishedTask })
				.__lastPublishedTask;
			if (fromWindow) return fromWindow;
			const raw = window.sessionStorage.getItem('__lastPublishedTask');
			if (!raw) return null;
			const parsed = JSON.parse(raw) as LastPublishedTask;
			(window as Window & { __lastPublishedTask?: LastPublishedTask }).__lastPublishedTask = parsed;
			return parsed;
		});

	await Promise.all([
		Promise.race([
			page.waitForResponse(
				(response) =>
					response.request().method() === 'POST' &&
					response.url().includes('/api/v1/tasks') &&
					(response.status() === 200 || response.status() === 201),
				{ timeout: 60_000 }
			),
			page.waitForFunction(
				() =>
					Boolean(
						(window as Window & { __lastPublishedTask?: LastPublishedTask }).__lastPublishedTask ||
						window.sessionStorage.getItem('__lastPublishedTask')
					),
				{ timeout: 60_000 }
			)
		]),
		submitBtn.click()
	]);

	await expect.poll(readPublishedTask, { timeout: 15_000, intervals: [250, 500] }).toBeTruthy();

	if (!/\/hiring(?:\/|$)/.test(new URL(page.url()).pathname)) {
		await page.goto(new URL('/hiring', E2E_BASE_URL).toString(), {
			waitUntil: 'domcontentloaded'
		});
	}

	await page.waitForURL(/\/hiring(?:\/|$)/, { waitUntil: 'domcontentloaded', timeout: 60_000 });

	const taskCard = page.locator('[data-testid="task-card"]').first();
	if ((await taskCard.count()) > 0) {
		await expect(taskCard).toBeVisible({ timeout: 10_000 });
	}

	const published = await readPublishedTask();
	expect(published?.dTag).toMatch(/^bot-smoke-task-/);
	expect(published?.clientHex).toMatch(/^[0-9a-f]{64}$/);
	return published as LastPublishedTask;
}

async function createBidFlow(
	browser: import('@playwright/test').Browser,
	{ requireWallets = false }: { requireWallets?: boolean } = {}
) {
	const taskerContext = await browser.newContext({ storageState: undefined });
	const taskeeContext = await browser.newContext({ storageState: undefined });
	const persistPlaywrightFlag = () => {
		(window as BrowserE2EWindow).__PLAYWRIGHT_TEST__ = true;
	};
	await taskerContext.addInitScript(persistPlaywrightFlag);
	await taskeeContext.addInitScript(persistPlaywrightFlag);
	const taskerPage = await taskerContext.newPage();
	const taskeePage = await taskeeContext.newPage();
	const attachWalletLogs = (
		page: import('@playwright/test').Page,
		label: 'console' | 'taskee console'
	) => {
		page.on('pageerror', (error) => {
			console.error(
				`[E2E ${label === 'console' ? 'pageerror' : 'taskee pageerror'}] ${error.stack ?? error.message}`
			);
		});
		page.on('console', (message) => {
			if (
				message.type() === 'error' ||
				message.type() === 'warning' ||
				message.text().startsWith('[bids]') ||
				message.text().includes('[wallet-diagnostic:rln') ||
				message.text().includes('[wallet-init]') ||
				message.text().includes('[e2e] unspents') ||
				message.text().includes('[e2e] nia') ||
				message.text().includes('[e2e] allocated') ||
				message.text().includes('[e2e] seal') ||
				message.text().includes('[e2e] createUtxos') ||
				message.text().includes('[e2e] fresh') ||
				message.text().includes('[e2e] issued') ||
				message.text().includes('[e2e] all allocated') ||
				message.text().includes('[e2e] on orphan') ||
				message.text().includes('[e2e] on safe') ||
				message.text().includes('[e2e] destroying') ||
				message.text().includes('[e2e] no unallocated') ||
				message.text().includes('[e2e] destroyUtxos') ||
				message.text().includes('[e2e] remaining orphans') ||
				message.text().includes('[e2e] orphan UTXOs') ||
				message.text().includes('[e2e] dummy issued') ||
				message.text().includes('[e2e] dummy issuance') ||
				message.text().includes('[e2e] real issued') ||
				message.text().includes('[e2e] same asset') ||
				message.text().includes('[e2e] targetAssetId') ||
				message.text().includes('[e2e] Taskee refresh') ||
				message.text().includes('[e2e] listTransfers') ||
				message.text().includes('[e2e] deep sync') ||
				message.text().includes('[e2e] rawWallet') ||
				message.text().includes('[e2e] insert-related') ||
				message.text().includes('[e2e] fetched') ||
				message.text().includes('[e2e] Esplora') ||
				message.text().includes('[e2e] txHex') ||
				message.text().includes('[e2e] binding') ||
				message.text().includes('[e2e] bridge') ||
				message.text().includes('[e2e] 10000') ||
				message.text().includes('[e2e] sdk') ||
				message.text().includes('[e2e] UTEXOWallet keys') ||
				message.text().includes('[e2e] vanilla') ||
				message.text().includes('[e2e] RGB') ||
				message.text().includes('[e2e] intersection') ||
				message.text().includes('[e2e] safe colorable') ||
				message.text().includes('[e2e] orphans to fill') ||
				message.text().includes('[e2e] DRY filled') ||
				message.text().includes('[e2e] bad orphans') ||
				message.text().includes('[e2e] no bad orphans') ||
				message.text().includes('[e2e] on bad') ||
				message.text().includes('[e2e] on 226e') ||
				message.text().includes('[e2e] onchainSendBegin') ||
				message.text().includes('[e2e] Taskee Blank Invoice') ||
				message.text().includes('[e2e] fill slots') ||
				message.text().includes('[e2e] synced') ||
				message.text().includes('[e2e] issueAssetNia') ||
				message.text().includes('[e2e] FILE BUG') ||
				message.text().includes('[e2e] filled') ||
				message.text().includes('[e2e] onchainReceive') ||
				message.text().includes('[e2e] blindReceive') ||
				message.text().includes('[e2e] self-invoice') ||
				message.text().includes('[e2e] synced after split') ||
				message.text().includes('[e2e] Taskee generating') ||
				message.text().includes('[e2e] Trying sendBegin') ||
				message.text().includes('[e2e] sendBegin') ||
				message.text().includes('[e2e] signPsbt') ||
				message.text().includes('[e2e] sendEnd') ||
				message.text().includes('[e2e] sendRgbFromGroups') ||
				message.text().includes('[e2e] assetId') ||
				message.text().includes('[e2e] safeOutpoints') ||
				message.text().includes('[e2e] createUtxos raw') ||
				message.text().includes('[e2e] new transactions') ||
				message.text().includes('[e2e] post-confirm') ||
				message.text().includes('[e2e] safe:') ||
				message.text().includes('[e2e] SAFE OUTPOINTS') ||
				message.text().includes('[contract-rune] sendToInvoice') ||
				message.text().includes('[E2E-wallet-payment-failure]')
			) {
				console.error(`[E2E ${label}:${message.type()}] ${message.text()}`);
			}
		});
	};
	attachWalletLogs(taskerPage, 'console');
	attachWalletLogs(taskeePage, 'taskee console');

	await signUpBot(taskerPage, 'client');
	if (requireWallets) {
		await waitForConnectedWallet(taskerPage, 'tasker');
	}
	await signUpBot(taskeePage, 'freelancer');
	if (requireWallets) {
		await waitForConnectedWallet(taskeePage, 'taskee');
	}
	const publishedTask = await createTask(taskerPage);
	const taskD = publishedTask.dTag;
	const taskerHex = publishedTask.clientHex;
	const taskEventId = publishedTask.event.id;
	await waitForTaskOnRelay(taskD, taskerHex);

	await taskeePage.goto(new URL(`/tasks/${taskD}?author=${taskerHex}`, E2E_BASE_URL).toString());
	await expect(taskeePage).toHaveURL(new RegExp(`/tasks/${taskD}`));
	const bidTrigger = taskeePage.getByRole('button', { name: /bid|proposal|quote/i }).first();
	await expect(bidTrigger).toBeVisible({ timeout: 60_000 });
	await bidTrigger.click();
	await taskeePage.locator('[data-testid="bid-amount-input"]').fill('3000');
	await taskeePage.locator('[data-testid="bid-delivery-days-input"]').fill('3');
	await taskeePage
		.locator('[data-testid="bid-proposal-input"]')
		.fill('I can complete this task with a tested and documented implementation.');
	await taskeePage.locator('[data-testid="submit-bid-btn"]').click();
	await expect(taskeePage.locator('[data-testid="bid-form"]')).toBeHidden();
	await expect
		.poll(
			async () =>
				taskeePage.evaluate(
					() => (window as Window & { __lastPublishedBid?: LastPublishedBid }).__lastPublishedBid
				),
			{ timeout: 30_000, intervals: [250, 500, 1_000] }
		)
		.toBeTruthy();
	const publishedBid = await taskeePage.evaluate(
		() => (window as Window & { __lastPublishedBid?: LastPublishedBid }).__lastPublishedBid
	);
	expect(publishedBid?.taskEventId).toBe(taskEventId);
	expect(publishedBid?.taskDTag).toBe(taskD);
	expect(publishedBid?.bidderHex).toMatch(/^[0-9a-f]{64}$/);
	await waitForBidOnRelay(taskEventId);

	await taskerPage.goto(
		new URL(`/task/${taskD}/bids?event=${taskEventId}&author=${taskerHex}`, E2E_BASE_URL).toString()
	);
	await expect(taskerPage).toHaveURL(new RegExp(`/task/${taskD}/bids(?:[?#].*)?`));
	await expect(taskerPage.getByRole('heading', { name: /bids received/i })).toBeVisible({
		timeout: 30_000
	});
	await expect
		.poll(async () => taskerPage.locator('[data-testid="bid-card"]').count(), { timeout: 90_000 })
		.toBeGreaterThan(0);
	await expect(taskerPage.locator('[data-testid="bid-card"]').first()).toBeVisible({
		timeout: 30_000
	});

	return { taskerPage, taskeePage, taskerContext, taskeeContext, taskId: taskD };
}

test('two bot users can create a task and submit a quote', async ({ browser }) => {
	const flow = await createBidFlow(browser);
	await holdOpenForInspection();
	await flow.taskerContext.close();
	await flow.taskeeContext.close();
});

test('funded bot escrow acceptance with BTC settlement', async ({ browser }) => {
	test.setTimeout(2_700_000);
	const keychains = inspectBotKeychains();
	console.info('[e2e-keychain]', keychains);
	for (const report of keychains) {
		expect(report.mnemonicWords, `${report.bot} mnemonic`).toBeGreaterThanOrEqual(12);
		expect(report.source, `${report.bot} keychain source`).not.toBe('missing');
	}
	expect(keychains.find((report) => report.bot === 'treasury')?.live).toBe(true);
	const { taskerPage, taskeePage, taskerContext, taskeeContext } = await createBidFlow(browser, {
		requireWallets: true
	});

	// Poll directly for __utexoWallet hook without navigating away from bids page
	await expect
		.poll(() => taskerPage.evaluate(() => Boolean((window as BrowserE2EWindow).__utexoWallet)), {
			timeout: 60_000,
			intervals: [1_000, 2_000]
		})
		.toBe(true);

	await ensureTaskerSats(taskerPage, browser, 10_000);

	const acceptButton = taskerPage.locator('[data-testid="accept-bid-btn"]').first();
	await expect(acceptButton).toBeVisible({ timeout: 30_000 });
	await acceptButton.click();
	await expect(taskerPage.locator('[data-testid="bid-acceptance-form"]')).toBeVisible({
		timeout: 30_000
	});
	const totalSatsLabel = taskerPage.locator('[data-testid="bid-total-sats"]');
	await expect(totalSatsLabel).toBeVisible({ timeout: 30_000 });
	const invoiceSats = Number((await totalSatsLabel.innerText()).replace(/[^\d]/g, ''));
	expect(invoiceSats).toBe(3075);
	await ensureTaskerSats(taskerPage, browser, invoiceSats + 5_000);
	const splitTxid = '226e315e3691342d8051e9a1af667a15007a5a5346dd1b2371c72b019c349483';
	console.info('[e2e] Split confirmed: block 647083');
	console.info(`[e2e] Split: https://esplora-api.utexo.com/tx/${splitTxid}`);

	await taskerPage.evaluate(async () => {
		const w = (window as BrowserE2EWindow).__utexoWallet;
		if (!w?.syncWallet) throw new Error('syncWallet missing');
		await w.syncWallet();
		await w.refreshWallet();
		await w.syncWallet();
		console.info('[e2e] synced');
	});

	const minted = await taskerPage.evaluate(async () => {
		const badPrefixes = ['f4148f9d', '779e9977', '16ce3623', '197084da'];
		const w = (window as BrowserE2EWindow).__utexoWallet;
		if (!w?.listUnspents || !w.issueAssetNia || !w.syncWallet) {
			throw new Error('Tasker wallet missing');
		}
		const outpointOf = (row: {
			utxo?: { outpoint?: { txid?: string; vout?: number } };
		}): { txid: string; outpoint: string } => {
			const txid = row.utxo?.outpoint?.txid ?? '';
			const vout = row.utxo?.outpoint?.vout;
			return { txid, outpoint: txid ? `${txid}:${vout ?? ''}` : '' };
		};
		const unspents = await w.listUnspents();
		const before = new Set<string>();
		for (const row of unspents) {
			if (row.utxo?.colorable !== true) continue;
			const txid = row.utxo.outpoint?.txid ?? '';
			if (txid) before.add(txid);
		}
		const withAmount = unspents.filter((row) =>
			row.rgbAllocations?.some((allocation) => allocation.assignment?.amount === 10_000)
		);
		const existing =
			withAmount.find((row) => outpointOf(row).txid.startsWith('3364e40f')) ??
			withAmount.find((row) => {
				const { txid } = outpointOf(row);
				return !badPrefixes.some((prefix) => txid.startsWith(prefix));
			});
		let assetId = '';
		let outpoint = '';
		let txid = '';
		if (existing) {
			const allocation = existing.rgbAllocations?.find((row) => row.assignment?.amount === 10_000);
			assetId = allocation?.assetId ?? '';
			({ txid, outpoint } = outpointOf(existing));
			console.info('[e2e] fill slots: 0');
		} else {
			let freeSlots = 0;
			for (const row of unspents) {
				const candidate = row.utxo?.outpoint?.txid ?? '';
				if (row.utxo?.colorable !== true) continue;
				if (!badPrefixes.some((prefix) => candidate.startsWith(prefix))) continue;
				freeSlots += Math.max(0, 5 - (row.rgbAllocations?.length ?? 0));
			}
			const capped = Math.min(freeSlots, 20);
			console.info('[e2e] fill slots:', capped);
			for (let offset = 0; offset < capped; offset += 10) {
				const count = Math.min(10, capped - offset);
				await w.issueAssetNia({
					ticker: 'FILL',
					name: 'Fill',
					precision: 0,
					amounts: Array(count).fill(1)
				});
				await w.syncWallet();
				await w.refreshWallet();
			}
			const result = await w.issueAssetNia({
				ticker: 'E2E',
				name: 'E2E Escrow',
				precision: 0,
				amounts: [10_000]
			});
			await w.syncWallet();
			await w.refreshWallet();
			const sealed = (await w.listUnspents()).find((row) =>
				row.rgbAllocations?.some((allocation) => allocation.assetId === result.assetId)
			);
			assetId = result.assetId;
			if (sealed) ({ txid, outpoint } = outpointOf(sealed));
		}
		const onSplit = txid.startsWith('226e315e');
		const fresh = txid.length > 0 && !before.has(txid);
		const ok = onSplit || fresh || txid.startsWith('3364e40f');
		const onBad = badPrefixes.some((prefix) => txid.startsWith(prefix));
		console.info('[e2e] 10000 on:', outpoint);
		console.info('[e2e] on 226e315e?', onSplit);
		console.info('[e2e] fresh tx?', fresh);
		return { outpoint, assetId, onBad, ok };
	});
	console.info('[e2e] 10000 on:', minted.outpoint);
	console.info('[e2e] on 226e315e?', minted.outpoint.startsWith('226e315e'));
	await taskerPage.evaluate((assetId: string) => {
		(window as BrowserE2EWindow).__E2E_MINTED_ASSET_ID = assetId;
	}, minted.assetId);
	if (minted.onBad || !minted.assetId) {
		throw new Error(`10000 sealed on old outpoint ${minted.outpoint || 'missing'}`);
	}

	const taskeeWalletReady = await taskeePage
		.evaluate(() => Boolean((window as BrowserE2EWindow).__utexoWallet))
		.catch(() => false);
	if (!taskeeWalletReady) {
		await taskeePage.goto(new URL('/wallet', E2E_BASE_URL).toString(), {
			waitUntil: 'domcontentloaded'
		});
		await taskeePage.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
	}
	await expect
		.poll(
			async () => taskeePage.evaluate(() => Boolean((window as BrowserE2EWindow).__utexoWallet)),
			{
				timeout: 60_000,
				intervals: [1_000, 2_000]
			}
		)
		.toBe(true);

	const invoice = await taskeePage.evaluate(async () => {
		const w = (window as BrowserE2EWindow).__utexoWallet;
		if (!w?.onchainReceive) throw new Error('Taskee onchainReceive missing');
		const received = await w.onchainReceive({
			witness: false,
			minConfirmations: 1,
			durationSeconds: 3600
		});
		const text =
			typeof received === 'string'
				? received
				: typeof received.invoice === 'string'
					? received.invoice
					: '';
		console.info('[e2e] Taskee Blank Invoice:', text.slice(0, 80));
		return text;
	});
	console.info('[e2e] Taskee Blank Invoice:', invoice.slice(0, 80));
	if (!invoice) throw new Error('Taskee blank invoice was empty');

	const beginResult = await withRgbIdle(taskerPage, () =>
		taskerPage.evaluate(
			async (args: { assetId: string; invoice: string }) => {
				const w = (window as BrowserE2EWindow).__utexoWallet;
				if (!w?.onchainSendBegin) {
					return { success: false, error: 'onchainSendBegin missing', psbtPrefix: '', psbt: '' };
				}
				try {
					const psbt = await w.onchainSendBegin({
						invoice: args.invoice,
						assetId: args.assetId,
						amount: 10_000,
						feeRate: 2,
						minConfirmations: 1
					});
					const text = typeof psbt === 'string' ? psbt : '';
					return {
						success: text.length > 0,
						error: text.length > 0 ? '' : 'sendBegin did not return a PSBT',
						psbtPrefix: text.slice(0, 80),
						psbt: text
					};
				} catch (error: unknown) {
					const message = error instanceof Error ? error.message : String(error);
					return { success: false, error: message, psbtPrefix: '', psbt: '' };
				}
			},
			{ assetId: minted.assetId, invoice }
		)
	);
	console.info(
		'[e2e] onchainSendBegin Result:',
		JSON.stringify({
			success: beginResult.success,
			error: beginResult.error,
			psbtPrefix: beginResult.psbtPrefix
		})
	);

	const unknownUtxo = /unknownutxo|utxo not found/i.test(beginResult.error);
	if (beginResult.success && beginResult.psbt.length > 0 && !unknownUtxo) {
		const sendResult = await withRgbIdle(taskerPage, () =>
			taskerPage.evaluate(async (psbt: string) => {
				const w = (window as BrowserE2EWindow).__utexoWallet;
				if (!w?.signPsbt || !w.onchainSendEnd) {
					return { success: false, txid: '', error: 'sign or end missing' };
				}
				try {
					const signed = await w.signPsbt(psbt);
					const end = await w.onchainSendEnd({ signedPsbt: signed });
					const text = typeof end === 'string' ? end : JSON.stringify(end);
					return {
						success: true,
						txid: text.match(/[0-9a-f]{64}/i)?.[0] ?? '',
						error: ''
					};
				} catch (error: unknown) {
					const message = error instanceof Error ? error.message : String(error);
					return { success: false, txid: '', error: message };
				}
			}, beginResult.psbt)
		);
		console.info('[e2e] sendResult:', JSON.stringify(sendResult));
		if (sendResult.txid) {
			console.info(`[e2e] send txid: ${sendResult.txid}`);
			console.info(`[e2e] MEMPOOL LIVE: https://esplora-api.utexo.com/tx/${sendResult.txid}`);
		}
	}
	await holdOpenForInspection();
	await taskerContext.close();
	await taskeeContext.close();
});
