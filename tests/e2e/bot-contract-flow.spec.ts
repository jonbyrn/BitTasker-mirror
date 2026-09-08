import { test, expect } from '@playwright/test';
import { SimplePool } from 'nostr-tools';
import { signUpBot } from './fixtures/bot-auth';

test.use({ headless: false, launchOptions: { slowMo: 500 } });
test.describe.configure({ timeout: 600_000 });

const E2E_BASE_URL = process.env.PW_E2E_BASE_URL || 'http://localhost:3000';
const E2E_TASK_RELAY_URL = process.env.VITE_NOSTR_TASK_RELAY_URL || 'ws://localhost:7777';
const E2E_HOLD_OPEN_MS = Number(process.env.PW_E2E_HOLD_OPEN_MS ?? 0);
const E2E_CHECKPOINT_MS = Number(process.env.PW_E2E_CHECKPOINT_MS ?? 30_000);

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
};

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

async function waitForContractStatus(contractId: string, status: string): Promise<void> {
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
				{ timeout: 30_000, intervals: [500, 1_000, 2_000] }
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
	page.on('pageerror', (error) => {
		console.error(`[E2E pageerror] ${error.stack ?? error.message}`);
	});
	page.on('console', (message) => {
		if (
			message.type() === 'error' ||
			message.type() === 'warning' ||
			message.text().startsWith('[bids]')
		) {
			console.error(`[E2E console:${message.type()}] ${message.text()}`);
		}
	});

	await page.goto(new URL('/create-task', E2E_BASE_URL).toString());
	await expect(page.locator('[data-testid="task-create-form"]')).toBeVisible();
	await page.locator('[data-testid="task-title-input"]').fill(`Bot smoke task ${Date.now()}`);

	const categoryInput = page.locator('[data-testid="task-category-input"] .multiselect-wrapper');
	await categoryInput.click();
	await page.locator('[data-testid="task-category-input"] .category-option').first().click();

	const skillsInput = page.locator(
		'[data-testid="task-skills-input"] input:not([aria-hidden="true"])'
	);
	await skillsInput.fill('testing');
	await skillsInput.press('Enter');
	await page.locator('[data-testid="next-task-step-btn"]').click();

	await page.locator('[data-testid="remote-task-btn"]').click();
	await page.locator('[data-testid="next-task-step-btn"]').click();

	await page.locator('#budget-btc').fill('100000');
	await page
		.locator('[data-testid="task-description-input"]')
		.fill(
			'This task is created by the multi-user Playwright smoke test and needs a clear proposal.'
		);
	await page.locator('[data-testid="next-task-step-btn"]').click();
	await page.locator('[data-testid="submit-task-btn"]').click();

	await page.waitForURL(/\/hiring(?:\/|$)/, { waitUntil: 'domcontentloaded', timeout: 30_000 });
	const taskCard = page.locator('[data-testid="task-card"]').first();
	await expect(taskCard).toBeVisible({ timeout: 30_000 });

	await expect
		.poll(
			async () =>
				page.evaluate(
					() =>
						(window as Window & { __lastPublishedTask?: LastPublishedTask }).__lastPublishedTask ??
						null
				),
			{ timeout: 30_000, intervals: [250, 500, 1_000] }
		)
		.toBeTruthy();

	const published = await page.evaluate(
		() => (window as Window & { __lastPublishedTask?: LastPublishedTask }).__lastPublishedTask
	);
	expect(published?.dTag).toMatch(/^bot-smoke-task-/);
	expect(published?.clientHex).toMatch(/^[0-9a-f]{64}$/);
	return published as LastPublishedTask;
}

async function createBidFlow(browser: import('@playwright/test').Browser) {
	const taskerContext = await browser.newContext({ storageState: undefined });
	const taskeeContext = await browser.newContext({ storageState: undefined });
	const taskerPage = await taskerContext.newPage();
	const taskeePage = await taskeeContext.newPage();

	await signUpBot(taskerPage, 'client');
	const publishedTask = await createTask(taskerPage);
	const taskD = publishedTask.dTag;
	const taskerHex = publishedTask.clientHex;
	const taskEventId = publishedTask.event.id;
	await waitForTaskOnRelay(taskD, taskerHex);

	await signUpBot(taskeePage, 'freelancer');
	taskeePage.on('pageerror', (error) => {
		console.error(`[E2E taskee pageerror] ${error.stack ?? error.message}`);
	});
	taskeePage.on('console', (message) => {
		if (
			message.type() === 'error' ||
			message.type() === 'warning' ||
			message.text().startsWith('[bids]')
		) {
			console.error(`[E2E taskee console:${message.type()}] ${message.text()}`);
		}
	});
	await taskeePage.goto(new URL(`/tasks/${taskD}?author=${taskerHex}`, E2E_BASE_URL).toString());
	await expect(taskeePage.getByRole('heading', { name: /task details/i })).toBeVisible({
		timeout: 30_000
	});
	const bidTrigger = taskeePage.getByRole('button', { name: /bid|proposal|quote/i }).first();
	await expect(bidTrigger).toBeVisible({ timeout: 10_000 });
	await bidTrigger.click();
	await taskeePage.locator('[data-testid="bid-amount-input"]').fill('20');
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
	const { taskerPage, taskeePage, taskerContext, taskeeContext } = await createBidFlow(browser);

	const acceptButton = taskerPage.getByRole('button', { name: /accept/i }).first();
	await expect(acceptButton).toBeVisible({ timeout: 30_000 });
	await acceptButton.click();
	await expect(taskerPage.locator('[data-testid="bid-acceptance-form"]')).toBeVisible();
	await expect(taskerPage.locator('[data-testid="accept-fund-button"]')).toBeEnabled();
	await taskerPage.locator('[data-testid="accept-fund-button"]').click();
	await expect(taskerPage.locator('[data-testid="processing-state"]')).toBeHidden();
	await expect(taskerPage.locator('[data-testid="funding-error"]')).toHaveCount(0);
	await expect(taskerPage.locator('[data-testid="start-contract-button"]')).toBeVisible({
		timeout: 30_000
	});

	const contractId = await taskerPage.evaluate(
		() => (window as LastFundedContractWindow).__lastFundedContractId
	);
	expect(contractId).toMatch(/^contract-/);
	await expect(taskerPage.locator('[data-testid="bid-acceptance-form"]')).toBeVisible();
	await waitForContractStatus(contractId as string, 'funded');
	await showDemoCheckpoint(
		taskerPage,
		'Tasker',
		'Escrow funded',
		'Checkout is complete in demo mode. The Tasker sees the RGB escrow funded state and can start the task.'
	);
	await taskeePage.goto(new URL(`/earning/contracts/${contractId}`, E2E_BASE_URL).toString(), {
		waitUntil: 'domcontentloaded'
	});
	await expect(taskeePage.locator('[data-testid="contract-detail-view"]')).toBeVisible({
		timeout: 30_000
	});
	await showDemoCheckpoint(
		taskeePage,
		'Taskee',
		'Escrow received',
		'The Taskee can see the funded contract. In production, the RGB consignment is verified before this state is published.'
	);

	await taskerPage.locator('[data-testid="start-contract-button"]').click();
	await waitForContractStatus(contractId as string, 'work_in_progress');

	await taskeePage.goto(new URL(`/earning/contracts/${contractId}`, E2E_BASE_URL).toString(), {
		waitUntil: 'domcontentloaded'
	});
	await expect(taskeePage.locator('[data-testid="contract-detail-view"]')).toBeVisible({
		timeout: 30_000
	});
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

	await taskerPage.goto(new URL(`/hiring/contracts/${contractId}`, E2E_BASE_URL).toString(), {
		waitUntil: 'domcontentloaded'
	});
	await expect(taskerPage.locator('[data-testid="contract-detail-view"]')).toBeVisible({
		timeout: 30_000
	});
	await expect(taskerPage.locator('[data-testid="release-funds-panel"]')).toBeVisible({
		timeout: 30_000
	});
	await showDemoCheckpoint(
		taskerPage,
		'Tasker',
		'Review and release',
		'The Tasker reviews the Taskee message, then approves release of the RGB escrow.'
	);
	await taskerPage.locator('[data-testid="approve-release-funds-button"]').click();
	await waitForContractStatus(contractId as string, 'released');
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
