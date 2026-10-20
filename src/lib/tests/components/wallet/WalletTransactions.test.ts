import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { walletStore } from '$lib/stores/wallet/wallet-state';
import { initialState } from '$lib/stores/wallet/wallet-types';
import { setAdvancedMode } from '$lib/stores/wallet/wallet-mode';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$lib/runes/btcPrice.svelte', () => ({
	btcPrice: { price: 83_000 }
}));

const TX = 'cd'.repeat(32);
const NOW = Date.now();

function seed(): void {
	walletStore.set({
		...structuredClone(initialState),
		transactions: [
			{
				id: 'btc',
				type: 'send',
				amountSats: 10_000,
				timestamp: NOW - 2 * 86_400_000,
				status: 'confirmed',
				description: 'Bitcoin transfer',
				txHash: TX
			},
			{
				id: 'usdt',
				type: 'receive',
				amountSats: 0,
				assetUnits: 11_000_000,
				timestamp: NOW - 3_600_000,
				status: 'confirmed',
				description: 'RGB transfer',
				txHash: TX
			}
		]
	});
}

describe('wallet transactions view', () => {
	beforeEach(() => {
		localStorage.removeItem('bittasker.wallet-advanced');
		setAdvancedMode(false);
		seed();
	});

	afterEach(() => {
		cleanup();
		setAdvancedMode(false);
		walletStore.set(structuredClone(initialState));
	});

	it('shows one merged list and hides the txid until advanced mode', async () => {
		const component = (await import('$lib/components/wallet/WalletTransactions.svelte')).default;
		const onRefresh = vi.fn();
		const { getAllByTestId, getByTestId, queryByTestId } = render(component, { onRefresh });
		const rows = getAllByTestId('transaction-row');
		expect(rows).toHaveLength(2);
		expect(rows[0]).toHaveTextContent('wallet.transactions.received');
		expect(rows[0]).toHaveTextContent('$11.00');
		expect(rows[0]).toHaveTextContent('11.00 USDT');
		expect(rows[1]).toHaveTextContent('wallet.transactions.sent');
		expect(rows[1]).toHaveTextContent('$8.30');
		expect(rows[1]).toHaveTextContent('10,000 wallet.transactions.sats');
		expect(queryByTestId('transaction-txid')).toBeNull();
		expect(queryByTestId('transaction-explorer')).toBeNull();

		await fireEvent.click(rows[0]);
		expect(getByTestId('transaction-detail')).toBeTruthy();
		expect(queryByTestId('transaction-txid')).toBeNull();
		expect(queryByTestId('transaction-explorer')).toBeNull();

		setAdvancedMode(true);
		await waitFor(() => expect(getByTestId('transaction-txid')).toHaveTextContent(TX));
		const explorer = getByTestId('transaction-explorer');
		expect(explorer).toHaveAttribute('href', `https://esplora-api.utexo.com/tx/${TX}`);
		expect(explorer).toHaveTextContent('wallet.transactions.explorer');

		await fireEvent.click(getByTestId('transaction-detail-close'));
		expect(queryByTestId('transaction-detail')).toBeNull();
	});

	it('refreshes when the list is pulled down', async () => {
		const component = (await import('$lib/components/wallet/WalletTransactions.svelte')).default;
		const onRefresh = vi.fn();
		const { getByTestId } = render(component, { onRefresh });
		const surface = getByTestId('pull-to-refresh');
		await fireEvent.touchStart(surface, { touches: [{ clientY: 8 }] });
		await fireEvent.touchEnd(surface, { changedTouches: [{ clientY: 90 }] });
		expect(onRefresh).toHaveBeenCalledOnce();
	});

	it('shows an empty list without a refresh button', async () => {
		walletStore.set(structuredClone(initialState));
		const component = (await import('$lib/components/wallet/WalletTransactions.svelte')).default;
		const { getByTestId, queryByTestId, queryByRole } = render(component, { onRefresh: vi.fn() });
		expect(getByTestId('transactions-empty')).toHaveTextContent('wallet.transactions.empty');
		expect(queryByTestId('transaction-row')).toBeNull();
		expect(queryByRole('button', { name: 'wallet.refresh_transfers' })).toBeNull();
	});
});
