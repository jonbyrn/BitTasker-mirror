import { describe, expect, it, vi, beforeEach } from 'vitest';
import { setAdvancedMode } from '$lib/stores/wallet/wallet-mode';
import { btcPrice } from '$lib/runes/btcPrice.svelte';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import ReceivePaymentForm, {
	rememberOpenReceive,
	resetHeldInvoice
} from '$lib/components/wallet/ReceivePaymentForm.svelte';
import { appStore } from '$lib/stores/app.store';

const {
	getRgbAddress,
	getBtcBalanceSats,
	createLightningInvoice,
	onchainReceive,
	listAssets,
	requestLspInbound,
	generateQrCodeUrl,
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
		getBtcBalanceSats: vi.fn().mockReturnValue(100_000),
		createLightningInvoice: vi.fn().mockResolvedValue({ lnInvoice: 'lnbc500n1test' }),
		onchainReceive: vi.fn().mockResolvedValue({ invoice: 'rgb1receive' }),
		listAssets: vi.fn().mockResolvedValue({ nia: [] }),
		requestLspInbound: vi.fn().mockResolvedValue('lnbc500n1test'),
		generateQrCodeUrl: vi.fn(async (value: string) => `data:image/png;base64,${value}`),
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
		getBtcBalanceSats,
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

vi.mock('$lib/utils/helpers/generateQrCodeUrl', () => ({
	default: generateQrCodeUrl
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
		getBtcBalanceSats.mockReturnValue(100_000);
		vi.stubEnv('VITE_CLIENT_HOSTNAME', 'bittasker.com');
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

	it('asks for an amount when the USDT id is configured and the wallet has not listed it', async () => {
		walletState.set({
			isConnected: true,
			rgb: { address: 'bc1qstored', initialized: true, assets: [] },
			wdk: { btcOnchain: { address: 'bc1qwdk' } }
		});
		const { getByTestId, queryByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-usdt_rgb'));
		expect(queryByTestId('receive-usdt-unconfigured')).toBeNull();
		expect(getByTestId('receive-amount')).toBeTruthy();
		expect((getByTestId('receive-generate') as HTMLButtonElement).disabled).toBe(true);

		await fireEvent.input(getByTestId('receive-amount'), { target: { value: '100' } });
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() => expect(onchainReceive).toHaveBeenCalledTimes(1));
		expect(onchainReceive).toHaveBeenCalledWith(
			expect.objectContaining({
				assetId: 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y',
				amount: 100_000_000
			})
		);
	});

	it('shows the unconfigured banner only when the USDT id is missing', async () => {
		vi.stubEnv('VITE_RGB_USDT_ASSET_ID', 'rgb:2s69152-rg39309-8438210-usdt_testnet');
		walletState.set({
			isConnected: true,
			rgb: { address: 'bc1qstored', initialized: true, assets: [] },
			wdk: { btcOnchain: { address: 'bc1qwdk' } }
		});
		const { getByTestId, queryByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-usdt_rgb'));
		expect(getByTestId('receive-usdt-unconfigured')).toBeTruthy();
		expect(queryByTestId('receive-amount')).toBeNull();
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() => expect(onchainReceive).toHaveBeenCalledTimes(1));
		expect(onchainReceive).toHaveBeenCalledWith(
			expect.objectContaining({
				assetId: 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y',
				amount: 100_000_000
			})
		);
	});

	it('hides the banner when the wallet already lists USDT', async () => {
		vi.stubEnv('VITE_RGB_USDT_ASSET_ID', '');
		walletState.set({
			isConnected: true,
			rgb: {
				address: 'bc1qstored',
				initialized: true,
				assets: [{ symbol: 'USDT', assetId: 'rgb:f~held', precision: 6, balance: 0 }]
			},
			wdk: { btcOnchain: { address: 'bc1qwdk' } }
		});
		const { getByTestId, queryByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-usdt_rgb'));
		expect(queryByTestId('receive-usdt-unconfigured')).toBeNull();
		expect(getByTestId('receive-amount')).toBeTruthy();
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
		await waitFor(() => expect(getByTestId('receive-value').textContent).toContain('bc1qstored'));
		await fireEvent.click(getByTestId('receive-set-amount'));
		await fireEvent.click(getByTestId('receive-chip-100'));
		expect((getByTestId('receive-amount-usd') as HTMLInputElement).value).toBe('100');
		expect((getByTestId('receive-amount-sats') as HTMLInputElement).value).toBe('100000');
		await fireEvent.click(getByTestId('receive-unit-toggle'));
		expect(getByTestId('receive-amount-row')).toBeTruthy();
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
		expect(getByTestId('receive-tab-dollars')).toBeTruthy();
		expect(getByTestId('receive-tab-bitcoin')).toBeTruthy();
		expect(queryByTestId('receive-asset-usdt_rgb')).toBeNull();
		setAdvancedMode(true);
	});

	it('shows an existing receive code without replacing the choice screen', () => {
		rememberOpenReceive('rgb:open-code');
		setAdvancedMode(false);
		const { getByTestId } = render(ReceivePaymentForm);
		expect(getByTestId('open-receive').textContent).toContain('rgb:open-code');
		expect(getByTestId('receive-tab-bitcoin')).toBeTruthy();
		expect(getByTestId('receive-tab-dollars')).toBeTruthy();
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

	it('copies the on-chain address', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText },
			configurable: true
		});
		document.execCommand = vi.fn().mockReturnValue(false);
		const { getByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-generate'));
		await waitFor(() => expect(getByTestId('receive-value').textContent).toContain('bc1qstored'));
		await fireEvent.click(getByTestId('receive-copy'));

		await waitFor(() => expect(writeText).toHaveBeenCalledWith('bc1qstored'));
		expect(appStore.showSuccessToast).toHaveBeenCalledWith('wallet.address_copied');
	});

	it('says bitcoin is required before preparing a dollar receive', async () => {
		getBtcBalanceSats.mockReturnValue(0);
		const { getByTestId, queryByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-asset-usdt_rgb'));
		await fireEvent.input(getByTestId('receive-amount'), { target: { value: '10' } });
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() =>
			expect(getByTestId('receive-error').textContent).toContain('wallet.simple.need_bitcoin')
		);
		expect(queryByTestId('receive-creating')).toBeNull();
		expect(onchainReceive).not.toHaveBeenCalled();
		expect(queryByTestId('get-test-btc')).toBeNull();
	});

	it('links the signet faucet on the sandbox when bitcoin is missing', async () => {
		getBtcBalanceSats.mockReturnValue(0);
		vi.stubEnv('VITE_CLIENT_HOSTNAME', 'rgb.bittasker.com');
		setAdvancedMode(false);
		const { getByTestId } = render(ReceivePaymentForm);

		await fireEvent.click(getByTestId('receive-tab-dollars'));

		await waitFor(() =>
			expect(getByTestId('receive-error').textContent).toContain('wallet.simple.need_bitcoin')
		);
		const link = getByTestId('get-test-btc') as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe('https://t.me/Utexo_RLN_bot');
		expect(onchainReceive).not.toHaveBeenCalled();
		setAdvancedMode(true);
	});

	it('shows a QR for the on-chain bitcoin address', async () => {
		setAdvancedMode(false);
		const { getByTestId } = render(ReceivePaymentForm);

		await waitFor(() => expect(getByTestId('receive-value').textContent).toContain('bc1qstored'));
		expect(generateQrCodeUrl).toHaveBeenCalledWith('bc1qstored');
		expect(getByTestId('receive-qr').getAttribute('src')).toContain('bc1qstored');
		expect(getByTestId('receive-rail-onchain')).toBeTruthy();
		expect(getByTestId('receive-rail-lightning')).toBeTruthy();
		setAdvancedMode(true);
	});

	it('does not invent a lightning bitcoin invoice when lightning is down', async () => {
		setAdvancedMode(false);
		const { getByTestId, queryByTestId } = render(ReceivePaymentForm, {
			props: { lightningReady: false }
		});
		await waitFor(() => expect(getByTestId('receive-value').textContent).toContain('bc1qstored'));

		await fireEvent.click(getByTestId('receive-rail-lightning'));

		expect(getByTestId('receive-rail-unavailable').textContent).toContain(
			'wallet.simple.lightning_unavailable'
		);
		expect(queryByTestId('receive-value')).toBeNull();
		expect(queryByTestId('receive-qr')).toBeNull();
		expect((getByTestId('receive-set-amount') as HTMLButtonElement).disabled).toBe(true);
		expect(createLightningInvoice).not.toHaveBeenCalled();
		setAdvancedMode(true);
	});

	it('waits for an amount before creating a lightning bitcoin invoice', async () => {
		setAdvancedMode(false);
		btcPrice.price = 100_000;
		const { getByTestId, queryByTestId } = render(ReceivePaymentForm, {
			props: { lightningReady: true }
		});
		await waitFor(() => expect(getByTestId('receive-value').textContent).toContain('bc1qstored'));

		await fireEvent.click(getByTestId('receive-rail-lightning'));

		expect(queryByTestId('receive-value')).toBeNull();
		expect(queryByTestId('receive-qr')).toBeNull();
		expect(getByTestId('receive-lightning-needs-amount').textContent).toContain(
			'wallet.simple.set_amount_first'
		);
		expect(createLightningInvoice).not.toHaveBeenCalled();

		await fireEvent.click(getByTestId('receive-set-amount'));
		await fireEvent.click(getByTestId('receive-chip-100'));
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() =>
			expect(createLightningInvoice).toHaveBeenCalledWith({
				amountSats: 100000,
				expirySeconds: 3600
			})
		);
		await waitFor(() =>
			expect(getByTestId('receive-value').textContent).toContain('lnbc500n1test')
		);
		expect(getByTestId('receive-qr').getAttribute('src')).toContain('lnbc500n1test');
		expect(onchainReceive).not.toHaveBeenCalled();
		btcPrice.price = 0;
		setAdvancedMode(true);
	});

	it('keeps an on-chain bitcoin amount on-chain when lightning is ready', async () => {
		setAdvancedMode(false);
		btcPrice.price = 100_000;
		const { getByTestId } = render(ReceivePaymentForm, {
			props: { lightningReady: true }
		});
		await waitFor(() => expect(getByTestId('receive-value').textContent).toContain('bc1qstored'));
		await fireEvent.click(getByTestId('receive-set-amount'));
		await fireEvent.click(getByTestId('receive-chip-100'));
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() =>
			expect(getByTestId('receive-value').textContent).toContain('bitcoin:bc1qstored?amount=0.001')
		);
		expect(createLightningInvoice).not.toHaveBeenCalled();
		btcPrice.price = 0;
		setAdvancedMode(true);
	});

	it('shows lightning USDT as unavailable instead of an RGB invoice', async () => {
		setAdvancedMode(false);
		const { getByTestId, queryByTestId } = render(ReceivePaymentForm, {
			props: { lightningUsdtReady: false }
		});
		await waitFor(() => expect(getByTestId('receive-qr')).toBeTruthy());
		await fireEvent.click(getByTestId('receive-tab-dollars'));
		await waitFor(() => expect(onchainReceive).toHaveBeenCalledTimes(1));
		await fireEvent.click(getByTestId('receive-rail-lightning'));

		expect(getByTestId('receive-rail-unavailable')).toBeTruthy();
		expect(queryByTestId('receive-value')).toBeNull();
		expect(createLightningInvoice).not.toHaveBeenCalled();
		expect(onchainReceive).toHaveBeenCalledTimes(1);
		setAdvancedMode(true);
	});

	it('creates a lightning USDT invoice only after an amount is set', async () => {
		setAdvancedMode(false);
		const { getByTestId, queryByTestId } = render(ReceivePaymentForm, {
			props: { lightningUsdtReady: true }
		});
		await waitFor(() => expect(getByTestId('receive-value').textContent).toContain('bc1qstored'));
		await fireEvent.click(getByTestId('receive-tab-dollars'));
		await waitFor(() => expect(onchainReceive).toHaveBeenCalledTimes(1));
		await fireEvent.click(getByTestId('receive-rail-lightning'));

		expect(queryByTestId('receive-value')).toBeNull();
		expect(getByTestId('receive-lightning-needs-amount')).toBeTruthy();
		expect(createLightningInvoice).not.toHaveBeenCalled();

		await fireEvent.click(getByTestId('receive-set-amount'));
		await fireEvent.input(getByTestId('receive-amount-usd'), { target: { value: '10.5' } });
		await fireEvent.click(getByTestId('receive-generate'));

		await waitFor(() =>
			expect(createLightningInvoice).toHaveBeenCalledWith({
				expirySeconds: 3600,
				asset: {
					assetId: 'rgb:vDU5IB7L-ZJFyqM3-5KrG84e-L0Q4kzi-eg3y0nH-JzoBylw',
					amount: 10_500_000
				}
			})
		);
		await waitFor(() =>
			expect(getByTestId('receive-value').textContent).toContain('lnbc500n1test')
		);
		expect(getByTestId('receive-qr')).toBeTruthy();
		expect(onchainReceive).toHaveBeenCalledTimes(1);
		setAdvancedMode(true);
	});
});
