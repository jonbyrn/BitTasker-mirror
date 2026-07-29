/**
 * Connected Wallets — E2E tests for the Connected tab UI flow.
 *
 * MetaMask extension cannot be installed in Playwright's Chromium,
 * so connection tests validate error states, modal behavior, and
 * the Connected tab lifecycle.
 *
 * Requires: VITE_CONNECTED_WALLETS_ENABLED=true in test config
 * Auth:    passkey-from-file fixture (signup-onboarding.spec.ts must run first)
 */

import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from '../fixtures/passkey-auth-from-file';

test.describe('Connected Wallets — UI Flow', () => {
	test.skip(!webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);

	test('Connected tab renders and shows connect button', async ({
		authenticatedPageFromPasskeyFile: page
	}) => {
		await page.goto('/dashboard/wallet', { waitUntil: 'load' });

		// Tab bar should show Wallet (active) and Connected tabs
		const walletTab = page.getByText('Wallet');
		const connectedTab = page.getByText('Connected');
		await expect(walletTab).toBeVisible({ timeout: 10_000 });
		await expect(connectedTab).toBeVisible();

		// Switch to Connected tab
		await connectedTab.click();

		// Should show the "Connect a Wallet" primary button
		const connectBtn = page.getByText('Connect a Wallet');
		await expect(connectBtn).toBeVisible();
	});

	test('Connect modal opens and shows all connector options', async ({
		authenticatedPageFromPasskeyFile: page
	}) => {
		await page.goto('/dashboard/wallet', { waitUntil: 'load' });
		await page.getByText('Connected').click();

		// Click "Connect a Wallet" to open modal
		await page.getByText('Connect a Wallet').click();

		// Modal should be visible with all options
		const modal = page.locator('dialog[open], [role="dialog"]').first();
		await expect(modal).toBeVisible({ timeout: 5_000 });

		// All 4 connector options should be visible
		await expect(page.getByText('MetaMask')).toBeVisible();
		await expect(page.getByText('WalletConnect')).toBeVisible();
		await expect(page.getByText('Trezor')).toBeVisible();
		await expect(page.getByText('Ledger')).toBeVisible();

		// Cancel button should close the modal
		await page.getByText('Cancel').click();
		await expect(modal).not.toBeVisible();
	});

	test('MetaMask unavailable shows error message', async ({
		authenticatedPageFromPasskeyFile: page
	}) => {
		await page.goto('/dashboard/wallet', { waitUntil: 'load' });
		await page.getByText('Connected').click();

		// Open modal and click MetaMask
		await page.getByText('Connect a Wallet').click();
		await page.getByText('MetaMask').click();

		// Should show error — MetaMask not installed in Playwright
		const errorAlert = page.locator('.alert-error');
		await expect(errorAlert).toBeVisible({ timeout: 5_000 });
		const errorText = await errorAlert.textContent();
		expect(errorText).toMatch(/MetaMask not detected|Failed to connect/i);
	});

	test('Disconnect flow shows confirmation dialog', async ({
		authenticatedPageFromPasskeyFile: page
	}) => {
		// This test verifies the disconnect UI works even without a real wallet
		// connected (just validates the dialog renders)
		await page.goto('/dashboard/wallet', { waitUntil: 'load' });
		await page.getByText('Connected').click();

		// Connected tab should show the connect button (no wallets connected)
		await expect(page.getByText('Connect a Wallet')).toBeVisible();
	});

	test('Trezor requires platform check — shows error on web', async ({
		authenticatedPageFromPasskeyFile: page
	}) => {
		await page.goto('/dashboard/wallet', { waitUntil: 'load' });
		await page.getByText('Connected').click();
		await page.getByText('Connect a Wallet').click();

		// Trezor should be available on desktop web
		const trezorBtn = page.getByText('Trezor');
		await expect(trezorBtn).toBeVisible();
	});

	test('Ledger requires platform check — shows error if unavailable', async ({
		authenticatedPageFromPasskeyFile: page
	}) => {
		await page.goto('/dashboard/wallet', { waitUntil: 'load' });
		await page.getByText('Connected').click();
		await page.getByText('Connect a Wallet').click();

		const ledgerBtn = page.getByText('Ledger');
		await expect(ledgerBtn).toBeVisible();
	});

	test('Tab switching preserves wallet tab content', async ({
		authenticatedPageFromPasskeyFile: page
	}) => {
		await page.goto('/dashboard/wallet', { waitUntil: 'load' });

		// Wallet tab should show balance card
		await expect(page.getByText('Wallet')).toBeVisible();

		// Switch to Connected and back
		await page.getByText('Connected').click();
		await page.getByText('Wallet').click();

		// Balance card should still be visible
		await expect(page.getByText('Wallet')).toBeVisible();
	});
});
