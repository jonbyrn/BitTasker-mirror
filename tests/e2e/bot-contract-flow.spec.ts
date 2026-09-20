import { test, expect } from '@playwright/test';
import { SimplePool } from 'nostr-tools';
import { inspectBotKeychains, signUpBot } from './fixtures/bot-auth';
import { fundTestnetAddress } from './fixtures/treasury';

test.use({ headless: false, launchOptions: { slowMo: 1_000 } });
test.describe.configure({ timeout: 600_000 });

const E2E_BASE_URL = process.env.PW_E2E_BASE_URL || 'http://localhost:3000';
const E2E_TASK_RELAY_URL = process.env.VITE_NOSTR_TASK_RELAY_URL || 'ws://localhost:7777';
const E2E_HOLD_OPEN_MS = Number(process.env.PW_E2E_HOLD_OPEN_MS ?? 0);
const E2E_CHECKPOINT_MS = Number(process.env.PW_E2E_CHECKPOINT_MS ?? 30_000);
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

async function waitForWasm(page: import('@playwright/test').Page): Promise<void> {
	await page.waitForFunction(
		() =>
			typeof (window as LastFundedContractWindow).initWasm === 'function' ||
			(window as LastFundedContractWindow).__wasmReady === true,
		{ timeout: 60_000 }
	);
	await page.evaluate(async () => {
		const wasmWindow = window as LastFundedContractWindow;
		if (typeof wasmWindow.initWasm === 'function') {
			await wasmWindow.initWasm();
		}
	});
	await expect
		.poll(
			async () =>
				page.evaluate(
					() =>
						(window as LastFundedContractWindow).__wasmReady === true &&
						(window as LastFundedContractWindow).__wasmLive === true
				),
			{ timeout: 90_000, intervals: [250, 500, 1_000] }
		)
		.toBe(true);
}

async function attachContractPageGuards(page: import('@playwright/test').Page): Promise<void> {
	await page.route('**/*.{wasm,WASM}', async (route) => {
		await route.continue();
	});
	await page.route('**/wasm/**', async (route) => {
		await route.continue();
	});
	await page.route('**/api/v1/**', async (route) => {
		await route.continue();
	});
}

async function gotoContractPage(
	page: import('@playwright/test').Page,
	path: string
): Promise<void> {
	await attachContractPageGuards(page);
	const wasmAsset = page
		.waitForResponse((response) => /\/wasm\/|\.wasm(?:\?|$)/i.test(response.url()), {
			timeout: 60_000
		})
		.catch(() => null);
	await page.goto(new URL(path, E2E_BASE_URL).toString(), { waitUntil: 'domcontentloaded' });
	await waitForWasm(page);
	await wasmAsset;
	await expect(page.locator('[data-testid="contract-detail-view"]')).toBeVisible({
		timeout: 60_000
	});
}

async function waitForTaskOnRelay(taskD: string, clientHex: string): Promise<void> {
	const pool = new SimplePool();
	try {
		await expect
			.poll(
				async () => {
					const events = await pool.querySync([E2E_TASK_RELAY_URL], {
						kinds: [31000],
						authors: [clientHex],
						'#d': [taskD],
						limit: 1
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
	await expect(page.locator('[data-testid="wallet-connected"]')).toBeVisible({
		timeout: WALLET_SYNC_MS
	});
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

async function ensureTaskerSats(
	page: import('@playwright/test').Page,
	browser: import('@playwright/test').Browser,
	minSats: number
): Promise<void> {
	await waitForTaskerWallet(page);
	await page.evaluate(async () => {
		const refresh = (window as LastFundedContractWindow).__refreshBtcBalance;
		if (refresh) await refresh();
	});
	const snapshot = await page.evaluate(() => ({
		address: (window as LastFundedContractWindow).__btcAddress ?? '',
		balance: (window as LastFundedContractWindow).__btcBalanceSats ?? 0
	}));
	if (snapshot.balance >= minSats) return;
	if (!snapshot.address.startsWith('tb1')) {
		throw new Error(`Tasker wallet address is not testnet: ${snapshot.address || '(empty)'}`);
	}
	await fundTestnetAddress(browser, snapshot.address, minSats + 5_000);
	await expect
		.poll(
			async () => {
				await page.evaluate(async () => {
					const refresh = (window as LastFundedContractWindow).__refreshBtcBalance;
					if (refresh) await refresh();
				});
				return page.evaluate(() => (window as LastFundedContractWindow).__btcBalanceSats ?? 0);
			},
			{ timeout: TESTNET_CONFIRM_MS, intervals: [5_000, 10_000] }
		)
		.toBeGreaterThanOrEqual(minSats);
}

async function waitForContractStatus(
	contractId: string,
	status: string,
	timeout = TESTNET_CONFIRM_MS
): Promise<void> {
	const pool = new SimplePool();
	try {
		await expect
			.poll(
				async () => {
					const events = await pool.querySync([E2E_TASK_RELAY_URL], {
						kinds: [31006],
						'#r': [contractId],
						'#s': [status],
						limit: 10
					});
					return events.length;
				},
				{ timeout, intervals: [500, 1_000, 2_000] }
			)
			.toBeGreaterThan(0);
	} finally {
		pool.close([E2E_TASK_RELAY_URL]);
	}
}

async function holdOpenForInspection(): Promise<void> {
	if (!Number.isFinite(E2E_HOLD_OPEN_MS) || E2E_HOLD_OPEN_MS <= 0) return;
	await new Promise((resolve) => setTimeout(resolve, E2E_HOLD_OPEN_MS));
}

async function showDemoCheckpoint(
	page: import('@playwright/test').Page,
	user: 'Tasker' | 'Taskee',
	title: string,
	details: string
): Promise<void> {
	await page.bringToFront();
	await page.evaluate(
		({ user, title, details }) => {
			const existing = document.querySelector('[data-testid="e2e-demo-checkpoint"]');
			existing?.remove();
			const panel = document.createElement('aside');
			panel.dataset.testid = 'e2e-demo-checkpoint';
			panel.style.cssText =
				'position:fixed;z-index:2147483647;right:20px;bottom:20px;width:min(420px,calc(100vw - 40px));padding:18px;border:2px solid #22c55e;border-radius:14px;background:#0f172a;color:#f8fafc;box-shadow:0 18px 50px rgba(0,0,0,.35);font:14px/1.45 system-ui,sans-serif';
			panel.innerHTML = `<div style="color:#86efac;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Demo checkpoint · ${user}</div><div style="margin-top:6px;font-size:18px;font-weight:700">${title}</div><div style="margin-top:8px;color:#cbd5e1">${details}</div><div style="margin-top:12px;color:#94a3b8;font-size:12px">This window will continue in 30 seconds.</div>`;
			document.body.append(panel);
		},
		{ user, title, details }
	);
	if (Number.isFinite(E2E_CHECKPOINT_MS) && E2E_CHECKPOINT_MS > 0) {
		await new Promise((resolve) => setTimeout(resolve, E2E_CHECKPOINT_MS));
	}
	await page.evaluate(() =>
		document.querySelector('[data-testid="e2e-demo-checkpoint"]')?.remove()
	);
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
		window.__PLAYWRIGHT_TEST__ = true;
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
			console.error(`[E2E ${label === 'console' ? 'pageerror' : 'taskee pageerror'}] ${error.stack ?? error.message}`);
		});
		page.on('console', (message) => {
			if (
				message.type() === 'error' ||
				message.type() === 'warning' ||
				message.text().startsWith('[bids]') ||
				message.text().includes('[wallet-diagnostic:mnemonic]') ||
				message.text().includes('[wallet-diagnostic:rln')
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
	test.setTimeout(1_800_000);
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

	const acceptButton = taskerPage.locator('[data-testid="accept-bid-btn"]').first();
	await expect(acceptButton).toBeVisible({ timeout: 30_000 });
	await acceptButton.click();
	await expect(taskerPage.locator('[data-testid="bid-acceptance-form"]')).toBeVisible();
	await waitForWasm(taskerPage);
	await waitForTaskerWallet(taskerPage);
	const totalSatsLabel = taskerPage.locator('[data-testid="bid-total-sats"]');
	await expect(totalSatsLabel).toBeVisible({
		timeout: 30_000
	});
	const invoiceSats = Number((await totalSatsLabel.innerText()).replace(/[^\d]/g, ''));
	expect(invoiceSats).toBe(3075);
	await ensureTaskerSats(taskerPage, browser, invoiceSats + 5_000);
	await expect(taskerPage.locator('[data-testid="accept-fund-button"]')).toBeEnabled();
	await taskerPage.locator('[data-testid="accept-fund-button"]').click();
	await expect(taskerPage.locator('[data-testid="pay-funding-from-wallet"]')).toBeVisible({
		timeout: TESTNET_CONFIRM_MS
	});
	await expect(taskerPage.locator('[data-testid="funding-error"]')).toHaveCount(0);
	await taskerPage.locator('[data-testid="pay-funding-from-wallet"]').click();
	await expect(taskerPage.locator('[data-testid="start-contract-button"]')).toBeVisible({
		timeout: TESTNET_CONFIRM_MS
	});
	await expect(taskerPage.locator('[data-testid="funding-error"]')).toHaveCount(0);

	const contractId = await taskerPage.evaluate(
		() => (window as LastFundedContractWindow).__lastFundedContractId
	);
	expect(contractId).toMatch(/^contract-/);
	await expect(taskerPage.locator('[data-testid="bid-acceptance-form"]')).toBeVisible();
	await waitForContractStatus(contractId as string, 'funded', TESTNET_CONFIRM_MS);
	await showDemoCheckpoint(
		taskerPage,
		'Tasker',
		'Escrow funded',
		'Checkout is complete in demo mode. The Tasker sees the RGB escrow funded state and can start the task.'
	);
	await gotoContractPage(taskeePage, `/earning/contracts/${contractId}`);
	await showDemoCheckpoint(
		taskeePage,
		'Taskee',
		'Escrow received',
		'The Taskee can see the funded contract. In production, the RGB consignment is verified before this state is published.'
	);

	await waitForWasm(taskerPage);
	await taskerPage.locator('[data-testid="start-contract-button"]').click();
	await waitForContractStatus(contractId as string, 'work_in_progress');

	await gotoContractPage(taskeePage, `/earning/contracts/${contractId}`);
	await expect(taskeePage.locator('[data-testid="submit-deliverable-panel"]')).toBeVisible({
		timeout: 30_000
	});
	await showDemoCheckpoint(
		taskeePage,
		'Taskee',
		'Task started',
		'The Taskee receives the work-started contract message and submits the deliverable from this page.'
	);
	await taskeePage
		.locator('[data-testid="deliverable-message-input"]')
		.fill('Taskee deliverable submitted from the bot flow.');
	await taskeePage.locator('[data-testid="submit-deliverable-button"]').click();
	await waitForContractStatus(contractId as string, 'work_submitted');
	await showDemoCheckpoint(
		taskeePage,
		'Taskee',
		'Work submitted',
		'The submission is published to the contract timeline. The Tasker is notified that review is ready.'
	);

	await gotoContractPage(taskerPage, `/hiring/contracts/${contractId}`);
	await expect(taskerPage.locator('[data-testid="release-funds-panel"]')).toBeVisible({
		timeout: 60_000
	});
	await showDemoCheckpoint(
		taskerPage,
		'Tasker',
		'Review and release',
		'The Tasker reviews the Taskee message, then approves release of the RGB escrow.'
	);
	await waitForWasm(taskerPage);
	await taskerPage.locator('[data-testid="approve-release-funds-button"]').click();
	await waitForContractStatus(contractId as string, 'released', TESTNET_CONFIRM_MS);
	await expect(taskerPage.locator('[data-testid="contract-status"]')).toContainText('released', {
		timeout: 30_000
	});
	await showDemoCheckpoint(
		taskerPage,
		'Tasker',
		'Escrow released',
		'The contract is complete. In production, the RGB payout/consignment transfer is the settlement step after approval.'
	);

	await holdOpenForInspection();
	await taskerContext.close();
	await taskeeContext.close();
});
