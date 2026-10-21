import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
	beginWalletSession,
	noteChainView,
	resetWalletSession,
	setWalletRefreshing
} from '$lib/stores/wallet/wallet-session';
import { installMemoryStorage } from '$lib/tests/helpers/memory-storage';
import { setAdvancedMode } from '$lib/stores/wallet/wallet-mode';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import SendPaymentForm from '$lib/components/wallet/SendPaymentForm.svelte';
import { encodeRgbAmount } from '$lib/stores/wallet/decode-rgb-invoice';

const {
	sendBtc,
	payLightningInvoice,
	sendRgbAsset,
	rgbSendBlock,
	listRgbAssets,
	quoteSpendable,
	pendingReceives,
	payEscrowLightning,
	lightningState,
	showSuccessToast,
	showErrorToast,
	loadAssets
} = vi.hoisted(() => {
	function writable<T>(initial: T) {
		let value = initial;
		const subscribers = new Set<(next: T) => void>();
		return {
			set(next: T) {
				value = next;
				for (const run of subscribers) run(value);
			},
			subscribe(run: (next: T) => void) {
				subscribers.add(run);
				run(value);
				return () => {
					subscribers.delete(run);
				};
			}
		};
	}
	return {
		sendBtc: vi.fn().mockResolvedValue('txid-btc'),
		payLightningInvoice: vi.fn().mockResolvedValue({ txid: 'txid-ln', status: 'settled' }),
		sendRgbAsset: vi.fn().mockResolvedValue({ txid: 'ab'.repeat(32), batchTransferIdx: 0 }),
		rgbSendBlock: vi.fn().mockResolvedValue(''),
		payEscrowLightning: vi.fn().mockResolvedValue('ab'.repeat(32)),
		lightningState: writable({
			ready: false,
			peerHost: '',
			channel: 'idle' as const,
			lnInvoice: '',
			rgbInvoice: ''
		}),
		quoteSpendable: vi.fn().mockResolvedValue(100_000_000),
		pendingReceives: vi.fn().mockResolvedValue(0),
		listRgbAssets: vi.fn().mockResolvedValue({
			ifa: [
				{
					assetId: 'rgb:f~held-usdt',
					ticker: 'USDT',
					balance: { spendable: 100_000_000 }
				}
			]
		}),
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn(),
		loadAssets: vi.fn().mockResolvedValue(undefined)
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return { t: readable((key: string) => key), locale: readable('en') };
});

vi.mock('$lib/stores/wallet/wallet-manager', () => ({
	walletManager: {
		sendBtc,
		payLightningInvoice,
		sendRgbAsset,
		rgbSendBlock,
		listRgbAssets,
		quoteSpendable,
		pendingReceives,
		loadAssets
	}
}));

vi.mock('$lib/stores/wallet/signet-lsp', () => ({
	payEscrowLightning,
	lightningStore: lightningState,
	FAUCET_IFA_ASSET: 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y'
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
			isConnected: true,
			locked: false,
			isInitializing: false,
			syncing: false,
			error: null,
			rgb: {
				balanceSats: 500_000,
				initialized: true,
				error: null,
				assets: [
					{
						assetId: 'rgb:f~held-usdt',
						symbol: 'USDT',
						precision: 6,
						balance: 100_000_000,
						spendable: 0,
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
		installMemoryStorage();
		resetWalletSession();
		localStorage.clear();
		setAdvancedMode(true);
		vi.clearAllMocks();
		lightningState.set({
			ready: false,
			peerHost: '',
			channel: 'idle',
			lnInvoice: '',
			rgbInvoice: ''
		});
		vi.stubEnv('VITE_RGB_USDT_ASSET_ID', 'rgb1testusdtasset');
		rgbSendBlock.mockResolvedValue('');
		vi.stubEnv('VITE_PARTIAL_USDT_POLICY', '');
		quoteSpendable.mockResolvedValue(100_000_000);
		pendingReceives.mockResolvedValue(0);
		listRgbAssets.mockResolvedValue({
			ifa: [
				{
					assetId: 'rgb:f~held-usdt',
					ticker: 'USDT',
					balance: { spendable: 100_000_000 }
				}
			]
		});
	});

	afterEach(() => {
		resetWalletSession();
		localStorage.clear();
	});

	it('blocks Send while another tab holds this wallet', async () => {
		localStorage.setItem(
			'bittasker.wallet-lock.fp',
			JSON.stringify([{ id: 'other-tab', at: Date.now() }])
		);
		beginWalletSession('fp');
		const { getByTestId } = render(SendPaymentForm);

		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' }
		});
		await fireEvent.input(getByTestId('send-amount'), { target: { value: '21000' } });

		expect(getByTestId('send-other-session').textContent).toContain('wallet.other_session');
		expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(getByTestId('send-session-refresh'));
		expect(loadAssets).toHaveBeenCalled();
		expect(getByTestId('send-other-session')).toBeTruthy();
		expect(sendBtc).not.toHaveBeenCalled();
	});

	it('offers Refresh when the balance changed in another browser', async () => {
		beginWalletSession('fp');
		noteChainView('aa:1:100');
		localStorage.setItem(
			'bittasker.wallet-view.fp',
			JSON.stringify({ id: 'other-browser', signature: 'aa:1:100', at: Date.now() })
		);
		noteChainView('bb:0:70');
		const { getByTestId, queryByTestId } = render(SendPaymentForm);

		expect(getByTestId('send-other-session').textContent).toContain('wallet.other_session');
		await fireEvent.click(getByTestId('send-session-refresh'));
		expect(loadAssets).toHaveBeenCalled();
		expect(queryByTestId('send-other-session')).toBeNull();
	});

	it('shows Refreshing wallet while a resync is running', async () => {
		setWalletRefreshing(true);
		const { getByTestId } = render(SendPaymentForm);
		expect(getByTestId('send-refreshing').textContent).toContain('wallet.refreshing');
		expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(true);
	});

	it('sends on-chain BTC via walletManager.sendBtc with validated address and sats', async () => {
		const onSent = vi.fn();
		const onCancel = vi.fn();
		const { getByTestId } = render(SendPaymentForm, { props: { onSent, onCancel } });

		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' }
		});
		await fireEvent.input(getByTestId('send-amount'), { target: { value: '21000' } });
		await fireEvent.click(getByTestId('send-submit'));
		await fireEvent.click(getByTestId('send-confirm'));

		await waitFor(() => expect(sendBtc).toHaveBeenCalledTimes(1));
		expect(sendBtc).toHaveBeenCalledWith({
			address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
			amountSats: 21000,
			feeRate: 1
		});
		expect(onCancel).toHaveBeenCalled();
		expect(onSent).toHaveBeenCalledWith('txid-btc');
	});

	it('pays a Lightning USDT invoice with the entered amount and asset id', async () => {
		const { getByTestId } = render(SendPaymentForm);

		await fireEvent.click(getByTestId('asset-usdt_ln'));
		await fireEvent.input(getByTestId('send-destination'), { target: { value: 'lntb1usdtpay' } });
		await fireEvent.input(getByTestId('send-amount'), { target: { value: '100' } });
		await fireEvent.click(getByTestId('send-submit'));
		await fireEvent.click(getByTestId('send-confirm'));

		await waitFor(() => expect(payLightningInvoice).toHaveBeenCalledTimes(1));
		expect(payLightningInvoice).toHaveBeenCalledWith({
			lnInvoice: 'lntb1usdtpay',
			assetId: 'rgb:vDU5IB7L-ZJFyqM3-5KrG84e-L0Q4kzi-eg3y0nH-JzoBylw',
			assetAmount: 100_000_000
		});
		expect(payEscrowLightning).not.toHaveBeenCalled();
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
		await fireEvent.click(getByTestId('send-confirm'));

		await waitFor(() => expect(payLightningInvoice).toHaveBeenCalledTimes(1));
		expect(payLightningInvoice).toHaveBeenCalledWith({ lnInvoice: 'lnbc210n1pjexample' });
		expect(sendBtc).not.toHaveBeenCalled();
		expect(onSent).toHaveBeenCalledWith('txid-ln');
	});

	it('pays an on-chain RGB invoice without an LSP channel and keeps the rpcs endpoint', async () => {
		quoteSpendable.mockResolvedValue(1111);
		const onSent = vi.fn();
		const { getByTestId, queryByTestId } = render(SendPaymentForm, { props: { onSent } });
		const invoice =
			'rgb:~/~/nWca/sb:utxob:aqQFQkg2-2hUMrAn-IjmPmTr-MsdNpju-gG8r~FV-XP4F_Za-8FBTG?assignment_name=assetOwner&expiry=2000000000&endpoints=rpcs://rgb-proxy.utexo.com/json-rpc';

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), { target: { value: invoice } });

		const field = getByTestId('send-destination') as HTMLTextAreaElement;
		expect(field.value).toBe(invoice);
		expect(field.placeholder).toContain('rgb:');
		expect(field.value.endsWith('endpoints=rpcs://rgb-proxy.utexo.com/json-rpc')).toBe(true);
		await waitFor(() =>
			expect(getByTestId('send-ifa-asset').textContent).toContain('rgb:f~held-usdt')
		);
		expect((getByTestId('send-amount') as HTMLInputElement).value).toBe('0.001111');
		expect((getByTestId('send-amount') as HTMLInputElement).disabled).toBe(false);
		expect(queryByTestId('lsp-channel-closed')).toBeNull();
		await fireEvent.click(getByTestId('send-submit'));
		await fireEvent.click(getByTestId('send-confirm'));

		await waitFor(() => expect(sendRgbAsset).toHaveBeenCalledTimes(1));
		expect(sendRgbAsset).toHaveBeenCalledWith(
			expect.objectContaining({
				invoice,
				assetId: 'rgb:f~held-usdt',
				amount: 1111
			})
		);
		expect(payEscrowLightning).not.toHaveBeenCalled();
		expect(onSent).toHaveBeenCalledWith('ab'.repeat(32));
		expect(showSuccessToast).toHaveBeenCalledWith('wallet.toast.sent_successfully');
		expect(showErrorToast).not.toHaveBeenCalled();
	});

	it('does not toast success when the on-chain payment returns no id', async () => {
		quoteSpendable.mockResolvedValue(1111);
		sendRgbAsset.mockResolvedValueOnce({ txid: '', batchTransferIdx: 0 });
		const onSent = vi.fn();
		const { getByTestId } = render(SendPaymentForm, { props: { onSent } });

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'rgb:~/~/nWca/sb:utxob:rt2mOpmI-aaaa' }
		});
		await waitFor(() =>
			expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(false)
		);
		await fireEvent.click(getByTestId('send-submit'));
		await fireEvent.click(getByTestId('send-confirm'));

		await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
		expect((getByTestId('send-confirm') as HTMLButtonElement).disabled).toBe(true);
		expect(showSuccessToast).not.toHaveBeenCalled();
		expect(onSent).not.toHaveBeenCalled();
	});

	it('keeps Send disabled on a blank invoice when listAssets has no single IFA', async () => {
		listRgbAssets.mockResolvedValue({ ifa: [] });
		const { getByTestId } = render(SendPaymentForm);

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'rgb:~/~/nWca/sb:utxob:aqQFQkg2-aaaa' }
		});

		await waitFor(() => expect(getByTestId('send-ifa-missing')).toBeTruthy());
		expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(true);
		expect(getByTestId('send-ifa-missing').textContent).toContain('wallet.send_select_ifa');
		expect(sendRgbAsset).not.toHaveBeenCalled();
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

	it('sends the full typed USDT balance on-chain when the LSP channel is closed', async () => {
		const { getByTestId, queryByTestId } = render(SendPaymentForm);

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'rgb:~/~/~/sb:utxob:example' }
		});
		await fireEvent.input(getByTestId('send-amount'), { target: { value: '100' } });

		expect(queryByTestId('lsp-channel-closed')).toBeNull();
		await waitFor(() =>
			expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(false)
		);
		await fireEvent.click(getByTestId('send-submit'));
		await fireEvent.click(getByTestId('send-confirm'));
		await waitFor(() => expect(sendRgbAsset).toHaveBeenCalledTimes(1));
		expect(sendRgbAsset).toHaveBeenCalledWith(
			expect.objectContaining({ amount: 100_000_000, assetId: 'rgb:f~held-usdt' })
		);
		expect(payEscrowLightning).not.toHaveBeenCalled();
	});

	it('sends a typed USDT amount that is only part of the balance', async () => {
		lightningState.set({
			ready: true,
			peerHost: 'lsp-signet.utexo.com',
			channel: 'open',
			lnInvoice: '',
			rgbInvoice: ''
		});
		const { getByTestId, queryByTestId } = render(SendPaymentForm);

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'rgb:~/~/~/sb:utxob:example' }
		});
		await fireEvent.input(getByTestId('send-amount'), { target: { value: '10' } });

		await waitFor(() =>
			expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(false)
		);
		expect(queryByTestId('send-hold')).toBeNull();
		expect(queryByTestId('send-insufficient')).toBeNull();
		await fireEvent.click(getByTestId('send-submit'));
		await fireEvent.click(getByTestId('send-confirm'));
		await waitFor(() => expect(sendRgbAsset).toHaveBeenCalledTimes(1));
		expect(sendRgbAsset).toHaveBeenCalledWith(expect.objectContaining({ amount: 10_000_000 }));
	});

	it('warns and sends a short amount only after Send anyway on the sandbox', async () => {
		vi.stubEnv('VITE_PARTIAL_USDT_POLICY', 'warn');
		rgbSendBlock.mockResolvedValue('partial');
		const { getByTestId, queryByTestId } = render(SendPaymentForm);

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'rgb:~/~/~/sb:utxob:example' }
		});
		await fireEvent.input(getByTestId('send-amount'), { target: { value: '1' } });

		await waitFor(() => expect(getByTestId('partial-send-warn')).toBeTruthy());
		expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(true);
		expect(queryByTestId('send-anyway')).toBeTruthy();
		await fireEvent.click(getByTestId('send-anyway'));
		await waitFor(() => expect(sendRgbAsset).toHaveBeenCalledTimes(1));
		expect(sendRgbAsset).toHaveBeenCalledWith(
			expect.objectContaining({ amount: 1_000_000, acceptStuckChange: true })
		);
		vi.stubEnv('VITE_PARTIAL_USDT_POLICY', '');
	});

	it('keeps a short USDT send blocked when the sandbox warning is off', async () => {
		rgbSendBlock.mockResolvedValue('partial');
		const { getByTestId, queryByTestId } = render(SendPaymentForm);

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'rgb:~/~/~/sb:utxob:example' }
		});
		await fireEvent.input(getByTestId('send-amount'), { target: { value: '1' } });

		await waitFor(() => expect(getByTestId('send-hold')).toBeTruthy());
		expect(queryByTestId('send-anyway')).toBeNull();
		expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(true);
		expect(sendRgbAsset).not.toHaveBeenCalled();
	});

	it('blocks a USDT amount above the balance shown on the wallet', async () => {
		const { getByTestId } = render(SendPaymentForm);

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'rgb:~/~/~/sb:utxob:example' }
		});
		await fireEvent.input(getByTestId('send-amount'), { target: { value: '200000000' } });

		await waitFor(() => expect(getByTestId('send-not-spendable')).toBeTruthy());
		expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(true);
		expect(getByTestId('send-not-spendable').textContent).toContain('You can send up to $100.00');
		expect(sendRgbAsset).not.toHaveBeenCalled();
	});

	it('quotes the invoice asset instead of the configured USDT id', async () => {
		vi.stubEnv('VITE_RGB_USDT_ASSET_ID', 'rgb:buHqKXhJ-kWm2Fnb-mBA1eIz-qr4wn7I-07MDVPY-idSqdJs');
		quoteSpendable.mockResolvedValue(10_000_000);
		const faucet = 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y';
		const invoice = `rgb:${faucet.slice(4)}/~/${encodeRgbAmount(10_000_000)}/sb:utxob:7efSNuJ~-aaaa`;
		const { getByTestId } = render(SendPaymentForm);

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), { target: { value: invoice } });

		await waitFor(() => {
			expect(quoteSpendable).toHaveBeenLastCalledWith(faucet);
			expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(false);
		});
		expect(quoteSpendable).not.toHaveBeenCalledWith(
			'rgb:buHqKXhJ-kWm2Fnb-mBA1eIz-qr4wn7I-07MDVPY-idSqdJs'
		);
		expect(getByTestId('available-balance').textContent).toContain('10.00 USDT');
		await fireEvent.click(getByTestId('send-submit'));
		await fireEvent.click(getByTestId('send-confirm'));
		await waitFor(() =>
			expect(sendRgbAsset).toHaveBeenCalledWith(
				expect.objectContaining({ assetId: faucet, amount: 10_000_000, invoice })
			)
		);
	});

	it('sends 10 USDT when spendable is 100 and a receive is still settling', async () => {
		quoteSpendable.mockResolvedValue(100_000_000);
		pendingReceives.mockResolvedValue(1);
		const { getByTestId, queryByTestId } = render(SendPaymentForm);
		const invoice = `rgb:~/-/${encodeRgbAmount(10_000_000)}/sb:utxob:7efSNuJ~-aaaa`;

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), { target: { value: invoice } });

		await waitFor(() => {
			expect(getByTestId('available-balance').textContent).toContain('100.00 USDT');
			expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(false);
		});
		expect(queryByTestId('send-hold')).toBeNull();
		expect(getByTestId('send-pending-info').textContent).toContain('wallet.send_pending_info');
		expect(queryByTestId('send-not-spendable')).toBeNull();
		expect(quoteSpendable).toHaveBeenCalled();
		await fireEvent.click(getByTestId('send-submit'));
		await fireEvent.click(getByTestId('send-confirm'));
		await waitFor(() =>
			expect(sendRgbAsset).toHaveBeenCalledWith(expect.objectContaining({ amount: 10_000_000 }))
		);
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
		await fireEvent.click(getByTestId('send-confirm'));

		await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
		expect(onSent).not.toHaveBeenCalled();
	});

	it('shows plain progress while a coin is made for the unsent dollars', async () => {
		quoteSpendable.mockResolvedValue(1111);
		let release: (value: { txid: string; batchTransferIdx: number }) => void = () => {};
		sendRgbAsset.mockImplementation(async (params: { onProgress?: (step: string) => void }) => {
			params.onProgress?.('change-coin');
			return new Promise((resolve) => {
				release = resolve;
			});
		});
		const onSent = vi.fn();
		const { getByTestId } = render(SendPaymentForm, { props: { onSent } });
		const invoice =
			'rgb:~/~/nWca/sb:utxob:aqQFQkg2-2hUMrAn-IjmPmTr-MsdNpju-gG8r~FV-XP4F_Za-8FBTG?assignment_name=assetOwner&expiry=2000000000&endpoints=rpcs://rgb-proxy.utexo.com/json-rpc';

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), { target: { value: invoice } });
		await waitFor(() =>
			expect((getByTestId('send-submit') as HTMLButtonElement).disabled).toBe(false)
		);
		await fireEvent.click(getByTestId('send-submit'));
		await fireEvent.click(getByTestId('send-confirm'));

		await waitFor(() =>
			expect(getByTestId('send-confirm').textContent).toContain('wallet.simple.making_change_coin')
		);
		release({ txid: 'ab'.repeat(32), batchTransferIdx: 0 });
		await waitFor(() => expect(onSent).toHaveBeenCalledWith('ab'.repeat(32)));
	});

	it('tells the sender to add bitcoin when the rest cannot come back', async () => {
		quoteSpendable.mockResolvedValue(100_000_000);
		sendRgbAsset.mockRejectedValueOnce(
			new Error(
				'Add a little bitcoin so the rest of your dollars can stay in this wallet. Nothing was sent.'
			)
		);
		const { getByTestId } = render(SendPaymentForm);
		const invoice = `rgb:~/-/${encodeRgbAmount(33_000_000)}/sb:utxob:7efSNuJ~-aaaa`;

		await fireEvent.click(getByTestId('asset-usdt_rgb'));
		await fireEvent.input(getByTestId('send-destination'), { target: { value: invoice } });
		await fireEvent.input(getByTestId('send-amount'), { target: { value: '33' } });
		await fireEvent.click(getByTestId('send-submit'));
		await fireEvent.click(getByTestId('send-confirm'));

		await waitFor(() =>
			expect(showErrorToast).toHaveBeenCalledWith('wallet.simple.change_needs_bitcoin')
		);
	});

	it('says why Send is off when the payment code cannot be read', async () => {
		setAdvancedMode(false);
		const { getByTestId, queryByTestId } = render(SendPaymentForm);

		expect(queryByTestId('send-destination')).toBeNull();
		await fireEvent.click(getByTestId('send-type'));
		await fireEvent.input(getByTestId('send-destination'), {
			target: { value: 'rgb:not-a-code' }
		});

		expect(getByTestId('send-invalid').textContent).toContain('wallet.simple.pay_invalid');
		expect((getByTestId('send-continue') as HTMLButtonElement).disabled).toBe(true);
		expect(queryByTestId('send-preparing')).toBeNull();
		setAdvancedMode(true);
	});
});
