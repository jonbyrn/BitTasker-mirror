import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import SendPaymentForm from '$lib/components/wallet/SendPaymentForm.svelte';

const { sendBtc, payLightningInvoice, sendRgbAsset, showSuccessToast, showErrorToast } = vi.hoisted(
	() => ({
		sendBtc: vi.fn().mockResolvedValue('txid-btc'),
		payLightningInvoice: vi.fn().mockResolvedValue({ txid: 'txid-ln', status: 'settled' }),
		sendRgbAsset: vi.fn().mockResolvedValue({ txid: 'ab'.repeat(32), batchTransferIdx: 0 }),
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn()
	})
);

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return { t: readable((key: string) => key), locale: readable('en') };
});

vi.mock('$lib/stores/wallet/wallet-manager', () => ({
	walletManager: { sendBtc, payLightningInvoice, sendRgbAsset }
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: { showSuccessToast, showErrorToast }
}));

vi.mock('$lib/runes/btcPrice.svelte', () => ({
	btcPrice: { price: 100_000 }
}));

vi.mock('$lib/stores/wallet/wallet-state', async () => {
	const { readable } = await import('svelte/store');
	return {
		walletStore: readable({
			rgb: {
				balanceSats: 500_000,
				initialized: true,
				assets: [
					{
						assetId: 'rgb:f~held-usdt',
						symbol: 'USDT',
						precision: 6,
						balance: 100_000_000,
						name: 'USDT Token'
					}
				]
			}
		}),
		state: { utexoWallet: {} }
	};
});

describe('SendPaymentForm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('VITE_RGB_USDT_ASSET_ID', 'rgb1testusdtasset');
	});

	it('sends on-chain BTC via walletManager.sendBtc with validated address and sats', async () => {
		const onSent = vi.fn();
		const { getByTestId } = render(SendPaymentForm, { props: { onSent } });

		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' }
		});
		await fireEvent.input(getByTestId('send-amount'), { target: { value: '21000' } });
		await fireEvent.click(getByTestId('send-submit'));

		await waitFor(() => expect(sendBtc).toHaveBeenCalledTimes(1));
		expect(sendBtc).toHaveBeenCalledWith({
			address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
			amountSats: 21000,
			feeRate: 1
		});
		expect(onSent).toHaveBeenCalledWith('txid-btc');
	});

	it('pays a Lightning invoice via walletManager.payLightningInvoice without an amount field', async () => {
		const onSent = vi.fn();
		const { getByTestId, queryByTestId } = render(SendPaymentForm, { props: { onSent } });

		await fireEvent.click(getByTestId('asset-btc_lightning'));
		expect(queryByTestId('send-amount')).toBeNull();

		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'lnbc210n1pjexample' }
		});
		await fireEvent.click(getByTestId('send-submit'));

		await waitFor(() => expect(payLightningInvoice).toHaveBeenCalledTimes(1));
		expect(payLightningInvoice).toHaveBeenCalledWith({ lnInvoice: 'lnbc210n1pjexample' });
		expect(sendBtc).not.toHaveBeenCalled();
		expect(onSent).toHaveBeenCalledWith('txid-ln');
	});

	it('locks nWca to 1111 and toasts only after a 64-hex txid', async () => {
		const onSent = vi.fn();
		const { getByTestId } = render(SendPaymentForm, { props: { onSent } });
		const invoice = 'rgb:~/~/nWca/sb:utxob:rt2mOpmI-aaaa?expiry=1790661182';

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), { target: { value: invoice } });

		expect((getByTestId('send-amount') as HTMLInputElement).value).toBe('1111');
		expect((getByTestId('send-amount') as HTMLInputElement).disabled).toBe(true);
		await fireEvent.click(getByTestId('send-submit'));

		await waitFor(() => expect(sendRgbAsset).toHaveBeenCalledTimes(1));
		expect(sendRgbAsset).toHaveBeenCalledWith({
			invoice,
			assetId: 'rgb:f~held-usdt',
			amount: 1111
		});
		expect(onSent).toHaveBeenCalledWith('ab'.repeat(32));
		expect(showSuccessToast).toHaveBeenCalledWith('wallet.toast.sent_successfully');
		expect(showErrorToast).not.toHaveBeenCalled();
	});

	it('does not toast success when send returns no txid', async () => {
		sendRgbAsset.mockResolvedValueOnce({ txid: '', batchTransferIdx: 0 });
		const onSent = vi.fn();
		const { getByTestId } = render(SendPaymentForm, { props: { onSent } });

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'rgb:~/~/nWca/sb:utxob:rt2mOpmI-aaaa' }
		});
		await fireEvent.click(getByTestId('send-submit'));

		await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
		expect(showSuccessToast).not.toHaveBeenCalled();
		expect(onSent).not.toHaveBeenCalled();
	});

	it('keeps Send disabled when the invoice amount is zero', async () => {
		const { getByTestId } = render(SendPaymentForm);

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'rgb:~/~/aa/sb:utxob:example' }
		});

		expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(true);
		expect(sendRgbAsset).not.toHaveBeenCalled();
	});

	it('allows a USDT amount inside the balance shown on the wallet', async () => {
		const { getByTestId, queryByTestId } = render(SendPaymentForm);

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'rgb:~/~/~/sb:utxob:example' }
		});
		await fireEvent.input(getByTestId('send-amount'), { target: { value: '4000' } });

		expect(queryByTestId('send-insufficient')).toBeNull();
		expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(false);
	});

	it('blocks a USDT amount above the balance shown on the wallet', async () => {
		const { getByTestId } = render(SendPaymentForm);

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'rgb:~/~/~/sb:utxob:example' }
		});
		await fireEvent.input(getByTestId('send-amount'), { target: { value: '200000000' } });

		expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(true);
		expect(getByTestId('send-insufficient')).toBeTruthy();
		expect(sendRgbAsset).not.toHaveBeenCalled();
	});

	it('blocks submission and shows error when balance is insufficient', async () => {
		const { getByTestId } = render(SendPaymentForm);

		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' }
		});
		await fireEvent.input(getByTestId('send-amount'), { target: { value: '600000' } });

		expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(true);
		expect(getByTestId('send-insufficient')).toBeTruthy();
		expect(sendBtc).not.toHaveBeenCalled();
	});

	it('rejects an invalid on-chain address before calling the wallet', async () => {
		const { getByTestId } = render(SendPaymentForm);

		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: '0xnotbitcoin' }
		});
		await fireEvent.input(getByTestId('send-amount'), { target: { value: '21000' } });

		expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(true);
		expect(sendBtc).not.toHaveBeenCalled();
	});

	it('surfaces wallet errors and does not call onSent', async () => {
		sendBtc.mockRejectedValueOnce(new Error('Insufficient UTXOs'));
		const onSent = vi.fn();
		const { getByTestId } = render(SendPaymentForm, { props: { onSent } });

		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' }
		});
		await fireEvent.input(getByTestId('send-amount'), { target: { value: '21000' } });
		await fireEvent.click(getByTestId('send-submit'));

		await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
		expect(onSent).not.toHaveBeenCalled();
	});
});
