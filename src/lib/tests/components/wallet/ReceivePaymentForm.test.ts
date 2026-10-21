import { describe, expect, it, vi, beforeEach } from 'vitest';
import { setAdvancedMode } from '$lib/stores/wallet/wallet-mode';
import { btcPrice } from '$lib/runes/btcPrice.svelte';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import ReceivePaymentForm, {
	rememberOpenReceive,
	resetHeldInvoice
} from '$lib/components/wallet/ReceivePaymentForm.svelte';

const {
	getRgbAddress,
	createLightningInvoice,
	onchainReceive,
	listAssets,
	requestLspInbound,
	lightningState,
	walletState
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
		getRgbAddress: vi.fn().mockResolvedValue('bc1qreceive'),
		createLightningInvoice: vi.fn().mockResolvedValue({ lnInvoice: 'lnbc500n1test' }),
		onchainReceive: vi.fn().mockResolvedValue({ invoice: 'rgb1receive' }),
		listAssets: vi.fn().mockResolvedValue({ nia: [] }),
		requestLspInbound: vi.fn().mockResolvedValue('lnbc500n1test'),
		lightningState: writable({
			ready: false,
			peerHost: '',
			channel: 'idle' as const,
			lnInvoice: 'lnbc500n1test',
			rgbInvoice: 'rgb:inbound'
		}),
		walletState: writable({
			isConnected: false,
			rgb: { address: 'bc1qstored', initialized: true, assets: [] as unknown[] },
			wdk: { btcOnchain: { address: 'bc1qwdk' } }
		})
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return { t: readable((key: string) => key), locale: readable('en') };
});

vi.mock('$lib/stores/wallet/wallet-manager', () => ({
	walletManager: {
		getRgbAddress,
		createLightningInvoice,
		initialize: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$lib/stores/wallet/signet-lsp', () => ({
	requestLspInbound,
	lightningStore: lightningState,
	FAUCET_IFA_ASSET: 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y'
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: { showSuccessToast: vi.fn(), showErrorToast: vi.fn() }
}));

vi.mock('$lib/stores/wallet/wallet-state', () => ({
	walletStore: walletState,
	state: { utexoWallet: { onchainReceive, listAssets } }
}));

describe('ReceivePaymentForm', () => {
	beforeEach(() => {
		resetHeldInvoice();
		vi.clearAllMocks();
		setAdvancedMode(true);
		walletState.set({
			isConnected: false,
			rgb: { address: 'bc1qstored', initialized: true, assets: [] },
			wdk: { btcOnchain: { address: 'bc1qwdk' } }
		});
		vi.stubEnv('VITE_RGB_USDT_ASSET_ID', 'rgb1testusdtasset');
	});

	it('shows the stored on-chain BTC address without amount input', async () => {
		const { getByTestId, queryByTestId } = render(ReceivePaymentForm);

		expect(queryByTestId('receive-amount')).toBeNull();
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() => expect(getByTestId('receive-value').textContent).toContain('bc1qstored'));
		expect(getRgbAddress).not.toHaveBeenCalled();
	});

	it('creates a Bolt11 for the entered sats and does not mint an inbound', async () => {
		const { getByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-btc_lightning'));
		await fireEvent.input(getByTestId('receive-amount'), { target: { value: '50000' } });
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() =>
			expect(createLightningInvoice).toHaveBeenCalledWith({
				amountSats: 50000,
				expirySeconds: 3600
			})
		);
		await waitFor(() =>
			expect(getByTestId('receive-value').textContent).toContain('lnbc500n1test')
		);
		expect(requestLspInbound).not.toHaveBeenCalled();
		expect(onchainReceive).not.toHaveBeenCalled();
	});

	it('keeps the on-chain RGB tab disabled while a receive is waiting', async () => {
		const { getByTestId } = render(ReceivePaymentForm, { props: { onchainLocked: true } });

		await fireEvent.click(getByTestId('receive-asset-usdt_rgb'));
		await fireEvent.input(getByTestId('receive-amount'), { target: { value: '1000' } });

		expect(getByTestId('receive-onchain-locked')).toBeTruthy();
		expect((getByTestId('receive-generate') as HTMLButtonElement).disabled).toBe(true);
		expect(onchainReceive).not.toHaveBeenCalled();
	});

	it('asks for an amount and invoices the faucet when the placeholder asset id is rejected', async () => {
		vi.stubEnv('VITE_RGB_USDT_ASSET_ID', 'rgb:2s69152-rg39309-8438210-usdt_testnet');
		const { getByTestId, queryByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-usdt_rgb'));

		expect(queryByTestId('receive-usdt-unconfigured')).toBeNull();
		expect(getByTestId('receive-amount')).toBeTruthy();
		expect((getByTestId('receive-generate') as HTMLButtonElement).disabled).toBe(true);

		await fireEvent.input(getByTestId('receive-amount'), { target: { value: '100' } });
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() => expect(onchainReceive).toHaveBeenCalledTimes(1));
		expect(onchainReceive).toHaveBeenCalledWith({
			amount: 100_000_000,
			assetId: 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y',
			blind: true,
			blinded: true
		});
		expect(onchainReceive).not.toHaveBeenCalledWith(expect.objectContaining({ amount: 1111 }));
		await waitFor(() => expect(getByTestId('receive-value').textContent).toContain('rgb1receive'));
	});

	it('scales an entered USDT amount by the asset precision', async () => {
		listAssets.mockResolvedValueOnce({
			ifa: [
				{
					assetId: 'rgb1testusdtasset',
					ticker: 'USDT',
					precision: 6,
					balance: { spendable: 100_000_000 }
				}
			]
		});
		const { getByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-usdt_rgb'));
		await fireEvent.input(getByTestId('receive-amount'), { target: { value: '10' } });
		expect(getByTestId('receive-usdt-raw').textContent).toBe('10000000');
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() => expect(onchainReceive).toHaveBeenCalledTimes(1));
		expect(onchainReceive).toHaveBeenCalledWith({
			amount: 10_000_000,
			assetId: 'rgb1testusdtasset',
			blind: true,
			blinded: true
		});
		await waitFor(() => expect(getByTestId('receive-usdt-amount')).toBeTruthy());
	});

	it('creates a named RGB invoice when this wallet already lists USDT', async () => {
		listAssets.mockResolvedValueOnce({ nia: [{ assetId: 'rgb1testusdtasset' }] });
		const { getByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-usdt_rgb'));
		await fireEvent.input(getByTestId('receive-amount'), { target: { value: '100000' } });
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() => expect(onchainReceive).toHaveBeenCalledTimes(1));
		expect(onchainReceive).toHaveBeenCalledWith({
			amount: 100_000_000_000,
			assetId: 'rgb1testusdtasset',
			blind: true,
			blinded: true
		});
		await waitFor(() => expect(getByTestId('receive-value').textContent).toContain('rgb1receive'));
	});

	it('invoices the signet faucet when the configured id is not in the wallet', async () => {
		const { getByTestId, queryByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-usdt_rgb'));
		await fireEvent.input(getByTestId('receive-amount'), { target: { value: '100' } });
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() => expect(onchainReceive).toHaveBeenCalledTimes(1));
		expect(onchainReceive).toHaveBeenCalledWith({
			amount: 100_000_000,
			assetId: 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y',
			blind: true,
			blinded: true
		});
		expect(onchainReceive).not.toHaveBeenCalledWith(
			expect.objectContaining({ assetId: 'rgb1testusdtasset' })
		);
		await waitFor(() => expect(getByTestId('receive-usdt-amount')).toBeTruthy());
		expect(queryByTestId('receive-usdt-blank-hint')).toBeNull();
	});

	it('shows a blank invoice when no amount was entered and the contract is missing', async () => {
		const blank = 'rgb:~/~/~/sb:utxob:older?endpoints=rpcs://rgb-proxy.utexo.com/json-rpc';
		onchainReceive.mockResolvedValue({ invoice: blank });
		walletState.set({
			isConnected: true,
			rgb: { address: 'bc1qstored', initialized: true, assets: [] },
			wdk: { btcOnchain: { address: 'bc1qwdk' } }
		});
		const { getByTestId, queryByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-usdt_rgb'));
		expect(queryByTestId('receive-amount')).toBeNull();
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() => expect(getByTestId('receive-value').textContent).toContain(blank));
		expect(queryByTestId('receive-error')).toBeNull();
		expect(onchainReceive).toHaveBeenCalledWith(
			expect.objectContaining({
				assetId: 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y',
				amount: 100_000_000
			})
		);
	});

	it('creates a Lightning USDT invoice for the entered amount and asset', async () => {
		const { getByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-usdt_ln'));
		await fireEvent.input(getByTestId('receive-amount'), { target: { value: '100' } });
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() =>
			expect(createLightningInvoice).toHaveBeenCalledWith({
				expirySeconds: 3600,
				asset: {
					assetId: 'rgb:vDU5IB7L-ZJFyqM3-5KrG84e-L0Q4kzi-eg3y0nH-JzoBylw',
					amount: 100_000_000
				}
			})
		);
		expect(onchainReceive).not.toHaveBeenCalled();
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

	it('asks for sats on a bitcoin receive and converts when the unit toggles', async () => {
		setAdvancedMode(false);
		btcPrice.price = 100_000;
		const { getByTestId } = render(ReceivePaymentForm);
		await fireEvent.click(getByTestId('get-bitcoin'));
		const input = getByTestId('receive-amount') as HTMLInputElement;
		expect(input.placeholder).toBe('0');
		await fireEvent.input(input, { target: { value: '100000' } });
		expect(getByTestId('receive-converted').textContent).toContain('$100.00');
		await fireEvent.click(getByTestId('receive-unit-toggle'));
		expect((getByTestId('receive-amount') as HTMLInputElement).value).toBe('100.00');
		expect(getByTestId('receive-converted').textContent).toContain('100,000');
		expect(getByTestId('receive-skip')).toBeTruthy();
		expect(getByTestId('receive-close')).toBeTruthy();
		await fireEvent.click(getByTestId('receive-generate'));
		await waitFor(() =>
			expect(getByTestId('receive-value').textContent).toContain('bitcoin:bc1qstored?amount=0.001')
		);
		expect(getByTestId('receive-share')).toBeTruthy();
		expect(getByTestId('receive-copy')).toBeTruthy();
		btcPrice.price = 0;
		setAdvancedMode(true);
	});

	it('asks for dollars or bitcoin before any rail', async () => {
		setAdvancedMode(false);
		const { getByTestId, queryByTestId } = render(ReceivePaymentForm);
		expect(getByTestId('get-dollars')).toBeTruthy();
		expect(getByTestId('get-bitcoin')).toBeTruthy();
		expect(queryByTestId('receive-asset-usdt_rgb')).toBeNull();
		setAdvancedMode(true);
	});

	it('shows an existing receive code without replacing the choice screen', () => {
		rememberOpenReceive('rgb:open-code');
		setAdvancedMode(false);
		const { getByTestId } = render(ReceivePaymentForm);
		expect(getByTestId('open-receive').textContent).toContain('rgb:open-code');
		expect(getByTestId('get-bitcoin')).toBeTruthy();
		expect(getByTestId('get-dollars')).toBeTruthy();
		setAdvancedMode(true);
	});

	it('surfaces invoice generation errors', async () => {
		listAssets.mockResolvedValueOnce({ nia: [{ assetId: 'rgb1testusdtasset' }] });
		onchainReceive.mockRejectedValueOnce(new Error('No channels'));
		const { getByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-usdt_rgb'));
		await fireEvent.input(getByTestId('receive-amount'), { target: { value: '1000' } });
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() => expect(getByTestId('receive-error').textContent).toContain('No channels'));
	});
});
