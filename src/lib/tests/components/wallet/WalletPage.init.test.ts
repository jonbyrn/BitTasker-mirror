import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { setAdvancedMode } from '$lib/stores/wallet/wallet-mode';
import { walletStore } from '$lib/stores/wallet/wallet-state';
import { initialState } from '$lib/stores/wallet/wallet-types';

const hoisted = vi.hoisted(() => ({
	initialize: vi.fn(),
	loadAssets: vi.fn(),
	unlock: vi.fn()
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$lib/services/feature-flags', () => ({
	isChangellyFiatEnabled: () => false
}));

vi.mock('$lib/components/wallet/BuyWithCard.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/wallet/ReceivePaymentForm.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/wallet/AdvancedLightning.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/wallet/SendPaymentForm.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/wallet/WalletPaymentModal.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/WebQrCodeScanner.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/stores/wallet/wallet-manager', () => ({
	walletManager: {
		initialize: hoisted.initialize,
		loadAssets: hoisted.loadAssets,
		unlock: hoisted.unlock
	}
}));

describe('wallet page init', () => {
	beforeEach(() => {
		localStorage.removeItem('bittasker.wallet-advanced');
		setAdvancedMode(false);
	});

	afterEach(() => {
		cleanup();
		setAdvancedMode(false);
		walletStore.set(structuredClone(initialState));
		vi.clearAllMocks();
	});

	it('calls wallet init when the page loads', async () => {
		hoisted.initialize.mockResolvedValue(undefined);
		hoisted.loadAssets.mockResolvedValue(undefined);
		const component = (await import('../../../../routes/(app)/(protected)/wallet/+page.svelte'))
			.default;
		render(component);
		await waitFor(() => expect(hoisted.initialize).toHaveBeenCalled());
	}, 30_000);

	it('keeps a switch between simple and advanced', async () => {
		hoisted.initialize.mockResolvedValue(undefined);
		hoisted.loadAssets.mockResolvedValue(undefined);
		const component = (await import('../../../../routes/(app)/(protected)/wallet/+page.svelte'))
			.default;
		const { getByTestId, queryByTestId } = render(component);
		const simple = getByTestId('mode-simple');
		const advanced = getByTestId('mode-advanced');
		expect(simple).toHaveAttribute('aria-pressed', 'true');
		await fireEvent.click(advanced);
		expect(advanced).toHaveAttribute('aria-pressed', 'true');
		expect(getByTestId('mode-simple')).toHaveAttribute('aria-pressed', 'false');
		await fireEvent.click(simple);
		expect(simple).toHaveAttribute('aria-pressed', 'true');
		expect(queryByTestId('buy-with-card')).toBeNull();
	}, 30_000);

	it('links to transactions and leaves history off the main wallet', async () => {
		hoisted.initialize.mockResolvedValue(undefined);
		hoisted.loadAssets.mockResolvedValue(undefined);
		const component = (await import('../../../../routes/(app)/(protected)/wallet/+page.svelte'))
			.default;
		const { getByTestId, queryByTestId, queryByText } = render(component);
		expect(queryByTestId('usdt-history')).toBeNull();
		expect(queryByTestId('usdt-history-empty')).toBeNull();
		expect(queryByTestId('refresh-usdt')).toBeNull();
		const refresh = getByTestId('refresh-transfers');
		expect(refresh.className).toContain('btn-circle');
		expect(refresh.className).not.toContain('w-full');
		expect(refresh.closest('div')?.querySelector('[data-testid="total-balance"]')).toBeTruthy();
		expect(refresh).toHaveAttribute('aria-label', 'wallet.refresh_transfers');
		expect(queryByTestId('wallet-details')).toBeNull();
		expect(queryByTestId('wallet-ready')).toBeNull();
		expect(queryByText('wallet.simple.no_usdt')).toBeNull();
		expect(queryByText('wallet.simple.details')).toBeNull();
		const transactions = getByTestId('wallet-transactions');
		expect(transactions).toHaveAttribute('href', '/wallet/transactions');
		expect(transactions).toHaveTextContent('wallet.simple.view_all');
		expect(getByTestId('wallet-activity')).toBeTruthy();
		expect(getByTestId('wallet-activity-empty')).toHaveTextContent('wallet.simple.activity_empty');
		expect(queryByTestId('wallet-add')).toBeNull();
		expect(queryByTestId('wallet-swap')).toBeNull();
		expect(getByTestId('total-balance')).toHaveTextContent('$0.00');
		expect(getByTestId('balance-unit-usd')).toHaveAttribute('aria-pressed', 'true');
		await fireEvent.click(getByTestId('balance-unit-sats'));
		expect(getByTestId('balance-unit-sats')).toHaveAttribute('aria-pressed', 'true');
		expect(getByTestId('total-balance')).toHaveTextContent('0 wallet.sats');
		await fireEvent.click(getByTestId('balance-unit-usd'));
		expect(getByTestId('total-balance')).toHaveTextContent('$0.00');
		expect(getByTestId('wallet-scan')).toBeTruthy();
		expect(getByTestId('balance-bitcoin')).toBeTruthy();
		expect(getByTestId('wallet-send')).toBeTruthy();
		expect(getByTestId('wallet-receive')).toBeDisabled();
		expect(getByTestId('wallet-scan-action')).toBeTruthy();
		expect(getByTestId('wallet-transfer')).toBeTruthy();
		expect(getByTestId('receive-needs-wallet')).toHaveTextContent('wallet.unlock_to_receive');
		expect(getByTestId('pull-to-refresh')).toBeTruthy();
		expect(queryByTestId('wallet-scanner')).toBeNull();
		expect(getByTestId('pull-to-refresh').className).toContain('wallet-dock-pad');
		expect(getByTestId('pull-to-refresh').className).toContain('max-w-md');
		await fireEvent.click(getByTestId('wallet-send'));
		expect(queryByTestId('wallet-scanner')).toBeNull();
		await fireEvent.click(getByTestId('wallet-scan-action'));
		const scanModal = getByTestId('wallet-scanner');
		expect(scanModal.className).toContain('modal');
		expect(scanModal.className).not.toContain('web-scanner-inline');
	}, 30_000);

	it('opens the scanner from the corner icon and asks before repair', async () => {
		hoisted.initialize.mockResolvedValue(undefined);
		hoisted.loadAssets.mockResolvedValue(undefined);
		walletStore.update((current) => ({
			...current,
			rgb: {
				...current.rgb,
				assets: [
					{
						assetId: 'rgb:usdt',
						symbol: 'USDT',
						name: 'USDT',
						balance: 0,
						precision: 6,
						chainSpendable: 0,
						chainSpent: 70_000_000
					}
				]
			}
		}));
		const component = (await import('../../../../routes/(app)/(protected)/wallet/+page.svelte'))
			.default;
		const { getByTestId, queryByTestId } = render(component);
		await fireEvent.click(getByTestId('wallet-scan'));
		const cornerModal = getByTestId('wallet-scanner');
		expect(cornerModal.className).toContain('modal');
		expect(cornerModal.className).not.toContain('web-scanner-inline');
		const repair = getByTestId('repair-wallet');
		expect(repair.className).not.toContain('btn');
		expect(getByTestId('usdt-locked').textContent).toContain('wallet.locked_or_unconfirmed');
		await fireEvent.click(repair);
		expect(getByTestId('repair-confirm').textContent).toContain('wallet.repair_confirm_body');
		await fireEvent.click(getByTestId('repair-cancel'));
		expect(queryByTestId('repair-confirm')).toBeNull();
		await fireEvent.click(getByTestId('repair-wallet'));
		await fireEvent.click(getByTestId('repair-confirm-go'));
		await waitFor(() =>
			expect(getByTestId('repair-note').textContent).toContain('wallet.repair_failed')
		);
	}, 30_000);

	it('shows the error when init throws', async () => {
		hoisted.initialize.mockRejectedValue(new Error('Wallet init timed out'));
		const component = (await import('../../../../routes/(app)/(protected)/wallet/+page.svelte'))
			.default;
		const { findByRole, getByTestId } = render(component);
		expect(await findByRole('alert')).toHaveTextContent('Wallet init timed out');
		const slot = getByTestId('wallet-error-slot');
		expect(slot.className).not.toContain('absolute');
		expect(
			slot.compareDocumentPosition(getByTestId('wallet-mode')) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
	}, 30_000);

	it('shows a skeleton until the wallet is ready', async () => {
		let release: () => void = () => {};
		hoisted.initialize.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		);
		const component = (await import('../../../../routes/(app)/(protected)/wallet/+page.svelte'))
			.default;
		const { getByTestId, queryByTestId } = render(component);
		const skeleton = getByTestId('wallet-skeleton');
		expect(skeleton.className).toContain('max-w-md');
		expect(skeleton.className).toContain('mx-auto');
		release();
		await waitFor(() => expect(queryByTestId('wallet-skeleton')).toBeNull());
	}, 30_000);

	it('unlocks from the locked dollars line', async () => {
		hoisted.initialize.mockResolvedValue(undefined);
		hoisted.loadAssets.mockResolvedValue(undefined);
		hoisted.unlock.mockResolvedValue(undefined);
		walletStore.update((current) => ({ ...current, locked: true }));
		const component = (await import('../../../../routes/(app)/(protected)/wallet/+page.svelte'))
			.default;
		const { getByTestId } = render(component);
		await fireEvent.click(getByTestId('wallet-locked-balance'));
		await waitFor(() => expect(hoisted.unlock).toHaveBeenCalled());
	}, 30_000);

	it('keeps the boot skeleton the same width as the wallet column', () => {
		const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
		const html = readFileSync(resolve(root, 'src/app.html'), 'utf8');
		expect(html).toContain('width: min(100%, 28rem)');
		const css = readFileSync(resolve(root, 'src/app.css'), 'utf8');
		expect(css).toContain('.wallet-dock-pad');
		expect(css).toContain('var(--bottom-nav-height-safe)');
	});
});
