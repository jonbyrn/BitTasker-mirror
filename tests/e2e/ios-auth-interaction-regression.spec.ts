import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';
import type { TestInfo } from '@playwright/test';
import {
	IOS_TIMEOUTS,
	activate,
	clickOutsideTarget,
	gotoAndExpect,
	requireMobileSafari
} from './utils/ios-interactions';
import type { Page } from '@playwright/test';

test.use({ credentialLabel: 'signup' });
const AUTH_READY_TIMEOUT_MS = 20_000;

function requireAuthenticatedIOS(testInfo: TestInfo): void {
	requireMobileSafari(testInfo, 'iOS Mobile Safari diagnostics only');
}

async function ensureContractsPanelVisible(page: Page): Promise<boolean> {
	const contractsPanel = page.locator('#panel-contracts').first();
	if (await contractsPanel.isVisible().catch(() => false)) return true;

	const contractsTab = page.locator('#tab-contracts').first();
	const tabVisible = await expect
		.poll(async () => contractsTab.isVisible().catch(() => false), {
			timeout: AUTH_READY_TIMEOUT_MS,
			intervals: [250, 500, 1000, 2000]
		})
		.toBe(true)
		.then(() => true)
		.catch(() => false);
	if (tabVisible) {
		await activate(contractsTab).catch(() => {});
	}

	return expect
		.poll(async () => contractsPanel.isVisible().catch(() => false), {
			timeout: AUTH_READY_TIMEOUT_MS,
			intervals: [250, 500, 1000, 2000]
		})
		.toBeTruthy()
		.then(() => true)
		.catch(() => false);
}

function messagesNewChatTrigger(page: Page) {
	return page.locator(
		[
			'button[aria-label*="new message" i]',
			'button:has-text("messages.new_message")',
			'button:has-text("messages.start_new_message")',
			'button:has-text("New Message")',
			'button:has-text("Start New Message")'
		].join(', ')
	).first();
}

function messagesModalRecipientInput(page: Page) {
	return page.locator('#recipient-pubkey').first();
}

function messagesModalDialog(page: Page) {
	return page.locator('.modal.modal-open .modal-box').first();
}

async function closeMessagesModal(page: Page, dialog: ReturnType<typeof messagesModalDialog>): Promise<void> {
	const recipientInput = messagesModalRecipientInput(page);
	const becameHidden = async () =>
		expect
			.poll(async () => !(await recipientInput.isVisible().catch(() => false)), {
				timeout: 3_000,
				intervals: [150, 250, 400, 700]
			})
			.toBe(true)
			.then(() => true)
			.catch(() => false);

	await clickOutsideTarget(page, dialog).catch(() => {});
	if (await becameHidden()) return;

	const modalRoot = page.locator('.modal.modal-open').first();
	if (await modalRoot.isVisible().catch(() => false)) {
		await modalRoot
			.click({ position: { x: 12, y: 12 }, timeout: IOS_TIMEOUTS.interaction })
			.catch(() => {});
		if (await becameHidden()) return;
	}

	const closeButton = dialog.getByRole('button', { name: /close|cancel/i }).first();
	if (await closeButton.isVisible().catch(() => false)) {
		await activate(closeButton).catch(() => {});
	}

	await expect(recipientInput).toBeHidden({ timeout: IOS_TIMEOUTS.hidden + 4_000 });
}

test.describe('iOS authenticated interaction regressions', () => {
	test.describe.configure({ retries: 0, timeout: 40_000 });
	test.beforeEach(() => {
		expect(webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE).toBeTruthy();
	});

	test('contracts status dropdown opens and closes by outside tap', async ({
		authenticatedPageCrossBrowser
	}, testInfo) => {
		requireAuthenticatedIOS(testInfo);
		const page = authenticatedPageCrossBrowser;

		await gotoAndExpect(page, '/dashboard?tab=contracts', /\/dashboard\?tab=contracts/);
		const contractsVisible = await ensureContractsPanelVisible(page);
		expect(contractsVisible, 'Contracts panel did not become visible in this run').toBeTruthy();
		const toggle = page
			.locator('#panel-contracts button[aria-controls="status-dropdown-menu"]')
			.first();
		await expect(
			toggle,
			'Contracts status dropdown trigger should be rendered for this regression check'
		).toBeVisible({
			timeout: AUTH_READY_TIMEOUT_MS
		});
		await activate(toggle);

		const menu = page.locator('#status-dropdown-menu').first();
		await expect(menu).toBeVisible({ timeout: IOS_TIMEOUTS.visible });
		await clickOutsideTarget(page, menu);
		await expect(menu).toBeHidden({ timeout: IOS_TIMEOUTS.hidden });
	});

	test('messages new-chat modal closes by backdrop and reopens', async ({
		authenticatedPageCrossBrowser
	}, testInfo) => {
		requireAuthenticatedIOS(testInfo);
		const page = authenticatedPageCrossBrowser;

		await gotoAndExpect(page, '/dashboard/messages', /\/dashboard\/messages(?:\?.*)?$/);
		const newMessageButton = messagesNewChatTrigger(page);
		const buttonVisible = await expect
			.poll(async () => newMessageButton.isVisible().catch(() => false), {
				timeout: AUTH_READY_TIMEOUT_MS,
				intervals: [250, 500, 1000, 2000]
			})
			.toBe(true)
			.then(() => true)
			.catch(() => false);
		expect(buttonVisible, 'New message action should be rendered for this regression check').toBeTruthy();

		const recipientInput = messagesModalRecipientInput(page);
		const dialog = messagesModalDialog(page);

		await activate(newMessageButton);
		await expect(recipientInput).toBeVisible({ timeout: IOS_TIMEOUTS.visible });
		await expect(dialog).toBeVisible({ timeout: IOS_TIMEOUTS.visible });
		await closeMessagesModal(page, dialog);

		await activate(newMessageButton);
		await expect(recipientInput).toBeVisible({ timeout: IOS_TIMEOUTS.visible });
		await expect(dialog).toBeVisible({ timeout: IOS_TIMEOUTS.visible });
		await closeMessagesModal(page, dialog);
		await expect(newMessageButton).toBeVisible({ timeout: AUTH_READY_TIMEOUT_MS });
	});
});
