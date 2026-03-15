import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';

import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
import { walletStore, walletManager } from '$lib/stores/wallet.store';

const mocks = vi.hoisted(() => ({
	showErrorToast: vi.fn(),
	amountInputSection: vi.fn()
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'wallet.receive_form.networks.lightning_bitcoin.label': 'Lightning Bitcoin',
		'wallet.receive_form.networks.rootstock_bitcoin.label': 'Rootstock Bitcoin',
		'wallet.receive_form.networks.liquid_bitcoin.label': 'Liquid Bitcoin',
		'wallet.receive_form.networks.bitcoin.label': 'Bitcoin',
		'wallet.receive_form.networks.lightning_bitcoin.description': 'Lightning',
		'wallet.receive_form.networks.rootstock_bitcoin.description': 'Rootstock',
		'wallet.receive_form.networks.liquid_bitcoin.description': 'Liquid',
		'wallet.receive_form.networks.bitcoin.description': 'Bitcoin',
		'wallet.receive.network': 'Network',
		'wallet.receive.get_paid': 'Get Paid',
		'wallet.receive.cancel': 'Cancel',
		'wallet.description': 'Description',
		'wallet.optional': 'Optional',
		'wallet.payment_for_placeholder': 'Payment for...',
		'wallet.network_fee': 'Network Fee',
		'wallet.receive.unit_sats': 'Sats',
		'wallet.receive.unit_usd': 'USD',
		'wallet.sats': 'Sats',
		'wallet.swap.loading_fees': 'Calculating fees...',
		'wallet.initializing': 'Initializing wallet...',
		'wallet.receive.invoice_total': 'Invoice Total',
		'wallet.receive.description_characters': 'characters',
		'wallet.coming_soon': 'Coming Soon',
		'wallet.swap.swap_fee': 'swap fee',
		'wallet.rsk_not_connected': 'RSK wallet not connected',
		'wallet.invoice.generation_failed': 'Failed to generate invoice',
		'wallet.swap.error.fee_fetch_failed': 'Failed to fetch fee estimate',
		'wallet.receive_form.network_not_available': 'Network not available',
		'common.back': 'Back',
		'common.next': 'Next'
	};

	return {
		t: readable((key: string) => translations[key] ?? key),
		locale: readable('en'),
		locales: readable(['en']),
		isLoading: readable(false)
	};
});

vi.mock('$lib/utils/helpers/common', async () => {
	const actual = await vi.importActual('$lib/utils/helpers/common');
	return {
		...actual,
		debounce: (fn: (...args: unknown[]) => unknown) => fn
	};
});

vi.mock('$lib/components/wallet/AmountInputSection.svelte', () => ({
	default: (...args: unknown[]) => {
		mocks.amountInputSection(...args);
		return null;
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: mocks.showErrorToast,
		showSuccessToast: vi.fn()
	}
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(50000)
	}
}));

vi.mock('$lib/utils/helpers/haptics', () => ({
	triggerHaptic: vi.fn(),
	ImpactStyle: { Light: 'Light', Medium: 'Medium' }
}));

vi.mock('$lib/stores/wallet.store', async () => {
	const { writable } = await import('svelte/store');
	const store = writable({
		hasAnyConnection: true,
		isConnected: true,
		isInitializing: false,
		rsk: {
			connected: true,
			address: '0x1111111111111111111111111111111111111111'
		},
		bsc: {
			connected: true,
			address: '0x2222222222222222222222222222222222222222'
		}
	});

	return {
		walletStore: store,
		walletManager: {
			getCachedReverseSwapPairs: vi.fn().mockResolvedValue({
				BTC: {
					RBTC: {
						limits: { minimal: 10000, maximal: 100000000 },
						fees: { percentage: 0.25, minerFees: { lockup: 27, claim: 20 } }
					}
				}
			}),
			getCachedChainSwapPairs: vi.fn().mockResolvedValue({
				'L-BTC': {
					RBTC: {
						limits: { minimal: 10000, maximal: 100000000 },
						fees: { percentage: 0.1, minerFees: { user: { lockup: 34, claim: 20 } } }
					}
				}
			}),
			estimateRBTCGas: vi.fn().mockResolvedValue({
				totalCostFormatted: '0.00103',
				gasLimit: '21000',
				gasPrice: '1000000000',
				totalCost: '1030000000000000'
			}),
			createReverseSwap: vi.fn().mockResolvedValue({ swapId: 'reverse-swap-1' }),
			createChainSwap: vi.fn().mockResolvedValue({ swapId: 'chain-swap-1' })
		},
		formatSats: (sats: number) => new Intl.NumberFormat('en-US').format(sats),
		formatUsd: (amount: number) =>
			new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
	};
});

describe('ReceivePaymentForm', () => {
	const onCancel = vi.fn();
	const onOpenPaymentRequest = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		walletStore.update(() => ({
			hasAnyConnection: true,
			isConnected: true,
			isInitializing: false,
			rsk: {
				connected: true,
				address: '0x1111111111111111111111111111111111111111'
			},
			bsc: {
				connected: true,
				address: '0x2222222222222222222222222222222222222222'
			}
		}));
	});

	it('renders the default network selector and primary actions', async () => {
		render(ReceivePaymentForm, { onCancel, onOpenPaymentRequest });

		expect(
			await screen.findAllByRole('button', { name: /Lightning Bitcoin\s*Network/i })
		).not.toHaveLength(0);
		expect(screen.getAllByRole('button', { name: /Cancel/i })).not.toHaveLength(0);
		expect(screen.getAllByRole('button', { name: /Get Paid|Next/i })).not.toHaveLength(0);
	});

	it('disables the primary action for zero-amount lightning requests', async () => {
		render(ReceivePaymentForm, { onCancel, onOpenPaymentRequest });

		const primaryButton =
			screen.queryAllByRole('button', { name: /Get Paid/i })[0] ??
			screen.getAllByRole('button', { name: /Next/i })[0];

		expect(primaryButton).toHaveAttribute('disabled');
	});

	it('submits a restored Rootstock direct request and preloads gas estimation', async () => {
		render(ReceivePaymentForm, {
			onCancel,
			onOpenPaymentRequest,
			initialFormState: {
				amount: '1500',
				unit: 'sats',
				mathExpression: '1500',
				memo: 'Rootstock payout',
				selectedNetwork: 'rootstock-bitcoin',
				chargeFeesToPayer: false,
				currentStep: 2
			}
		});

		await waitFor(() => {
			expect(walletManager.estimateRBTCGas).toHaveBeenCalledWith(
				'0x1111111111111111111111111111111111111111',
				'0.00001500'
			);
		});

		const getPaidButtons = await screen.findAllByRole('button', { name: /Get Paid/i });
		await fireEvent.click(getPaidButtons[0]);

		await waitFor(() => {
			expect(onOpenPaymentRequest).toHaveBeenCalledWith({
				address: '0x1111111111111111111111111111111111111111',
				network: 'rootstock-bitcoin',
				amount: 1500,
				memo: 'Rootstock payout',
				chargeFeesToPayer: false,
				totalFees: 103000,
				formState: {
					amount: '1500',
					unit: 'sats',
					mathExpression: '1500',
					memo: 'Rootstock payout',
					selectedNetwork: 'rootstock-bitcoin',
					chargeFeesToPayer: false
				}
			});
		});

		expect(onCancel).toHaveBeenCalled();
	});

	it('submits a restored Lightning swap request with preserved form state', async () => {
		render(ReceivePaymentForm, {
			onCancel,
			onOpenPaymentRequest,
			initialFormState: {
				amount: '10000',
				unit: 'sats',
				mathExpression: '10000',
				memo: 'Lightning invoice',
				selectedNetwork: 'lightning-bitcoin',
				chargeFeesToPayer: false,
				currentStep: 2
			}
		});

		const getPaidButtons = await screen.findAllByRole('button', { name: /Get Paid/i });
		await fireEvent.click(getPaidButtons[0]);

		await waitFor(() => {
			expect(walletManager.createReverseSwap).toHaveBeenCalledWith(10000);
			expect(onOpenPaymentRequest).toHaveBeenCalledWith({
				swapId: 'reverse-swap-1',
				formState: {
					amount: '10000',
					unit: 'sats',
					mathExpression: '10000',
					memo: 'Lightning invoice',
					selectedNetwork: 'lightning-bitcoin',
					chargeFeesToPayer: false
				}
			});
		});

		expect(onCancel).toHaveBeenCalled();
	});

	it('submits a restored USDT on BSC direct request with normalized direct-request state', async () => {
		render(ReceivePaymentForm, {
			onCancel,
			onOpenPaymentRequest,
			initialFormState: {
				amount: '12.345678',
				unit: 'sats',
				mathExpression: '12.345678',
				memo: 'BSC payout',
				selectedNetwork: 'usdt-bsc',
				chargeFeesToPayer: true,
				currentStep: 2
			}
		});

		const getPaidButtons = await screen.findAllByRole('button', { name: /Get Paid/i });
		await fireEvent.click(getPaidButtons[0]);

		await waitFor(() => {
			expect(onOpenPaymentRequest).toHaveBeenCalledWith({
				address: '0x2222222222222222222222222222222222222222',
				network: 'usdt-bsc',
				amount: 12.345678,
				memo: 'BSC payout',
				chargeFeesToPayer: false,
				totalFees: 0,
				formState: {
					amount: '12.345678',
					unit: 'usd',
					mathExpression: '12.345678',
					memo: 'BSC payout',
					selectedNetwork: 'usdt-bsc',
					chargeFeesToPayer: false
				}
			});
		});

		expect(onCancel).toHaveBeenCalled();
	});

	it('fails closed for USDT on BSC requests with more than 6 decimal places', async () => {
		render(ReceivePaymentForm, {
			onCancel,
			onOpenPaymentRequest,
			initialFormState: {
				amount: '1.1234567',
				unit: 'usd',
				mathExpression: '1.1234567',
				memo: 'Too precise',
				selectedNetwork: 'usdt-bsc',
				chargeFeesToPayer: false,
				currentStep: 2
			}
		});

		const getPaidButtons = await screen.findAllByRole('button', { name: /Get Paid/i });
		expect(getPaidButtons[0]).toBeDisabled();
		expect(onOpenPaymentRequest).not.toHaveBeenCalled();
		expect(mocks.showErrorToast).not.toHaveBeenCalled();
	});
});
