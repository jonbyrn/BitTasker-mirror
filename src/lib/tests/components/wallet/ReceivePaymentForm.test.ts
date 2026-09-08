import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';

const { getRgbAddress, createLightningInvoice, receiveRgbInvoice } = vi.hoisted(() => ({
	getRgbAddress: vi.fn().mockResolvedValue('bc1qreceive'),
	createLightningInvoice: vi.fn().mockResolvedValue({ lnInvoice: 'lnbc500n1test' }),
	receiveRgbInvoice: vi.fn().mockResolvedValue({
		invoice: 'rgb1receive',
		recipientId: 'rcp-1',
		expirationTimestamp: null
	})
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return { t: readable((key: string) => key), locale: readable('en') };
});

vi.mock('$lib/stores/wallet/wallet-manager', () => ({
	walletManager: { getRgbAddress, createLightningInvoice, receiveRgbInvoice }
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: { showSuccessToast: vi.fn(), showErrorToast: vi.fn() }
}));

vi.mock('$lib/stores/wallet/wallet-state', async () => {
	const { readable } = await import('svelte/store');
	return {
		walletStore: readable({
			rgb: { address: 'bc1qstored', initialized: true },
			wdk: { btcOnchain: { address: 'bc1qwdk' } }
		}),
		state: { utexoWallet: {} }
	};
});

describe('ReceivePaymentForm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('VITE_RGB_USDT_ASSET_ID', 'rgb1testusdtasset');
	});

	it('shows the stored on-chain BTC address without amount input', async () => {
		const { getByTestId, queryByTestId } = render(ReceivePaymentForm);

		expect(queryByTestId('receive-amount')).toBeNull();
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() =>
			expect(getByTestId('receive-value').textContent).toContain('bc1qstored')
		);
		expect(getRgbAddress).not.toHaveBeenCalled();
	});

	it('creates a Lightning invoice with the requested sats amount', async () => {
		const { getByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-btc_lightning'));
		await fireEvent.input(getByTestId('receive-amount'), { target: { value: '50000' } });
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() => expect(createLightningInvoice).toHaveBeenCalledTimes(1));
		expect(createLightningInvoice).toHaveBeenCalledWith({ amountSats: 50000 });
		await waitFor(() =>
			expect(getByTestId('receive-value').textContent).toContain('lnbc500n1test')
		);
	});

	it('creates a witness RGB invoice for USDT receives', async () => {
		const { getByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-usdt_rgb'));
		await fireEvent.input(getByTestId('receive-amount'), { target: { value: '100000' } });
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() => expect(receiveRgbInvoice).toHaveBeenCalledTimes(1));
		expect(receiveRgbInvoice).toHaveBeenCalledWith({
			amount: 100000,
			assetId: 'rgb1testusdtasset',
			witness: true
		});
		await waitFor(() => expect(getByTestId('receive-value').textContent).toContain('rgb1receive'));
	});

	it('keeps generate disabled until a valid amount is entered for invoice assets', async () => {
		const { getByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-btc_lightning'));
		expect((getByTestId('receive-generate') as HTMLButtonElement).disabled).toBe(true);

		await fireEvent.input(getByTestId('receive-amount'), { target: { value: '-5' } });
		expect((getByTestId('receive-generate') as HTMLButtonElement).disabled).toBe(true);

		await fireEvent.input(getByTestId('receive-amount'), { target: { value: '1000' } });
		expect((getByTestId('receive-generate') as HTMLButtonElement).disabled).toBe(false);
	});

	it('surfaces invoice generation errors', async () => {
		createLightningInvoice.mockRejectedValueOnce(new Error('No channels'));
		const { getByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-btc_lightning'));
		await fireEvent.input(getByTestId('receive-amount'), { target: { value: '1000' } });
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() => expect(getByTestId('receive-error').textContent).toContain('No channels'));
	});
});
