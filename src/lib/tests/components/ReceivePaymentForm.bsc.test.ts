import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
import { walletStore } from '$lib/stores/wallet.store';

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
			getCachedReverseSwapPairs: vi.fn().mockResolvedValue({ BTC: { RBTC: null } }),
			getCachedChainSwapPairs: vi.fn().mockResolvedValue({ 'L-BTC': { RBTC: null } }),
			estimateRBTCGas: vi.fn().mockResolvedValue({
				totalCostFormatted: '0.00103',
				gasLimit: '21000',
				gasPrice: '1000000000',
				totalCost: '1030000000000000'
			}),
			createReverseSwap: vi.fn(),
			createChainSwap: vi.fn()
		},
		formatSats: (sats: number) => new Intl.NumberFormat('en-US').format(sats),
		formatUsd: (amount: number) =>
			new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
	};
});

describe('ReceivePaymentForm BSC direct requests', () => {
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

	it('submits a token-native USDT on BSC request with preserved form state', async () => {
		render(ReceivePaymentForm, {
			onCancel,
			onOpenPaymentRequest,
			initialFormState: {
				amount: '12.345678',
				unit: 'usd',
				mathExpression: '12.345678',
				memo: 'USDT request',
				selectedNetwork: 'usdt-bsc',
				chargeFeesToPayer: false,
				currentStep: 2
			}
		});

		const getPaidButton = await screen.findAllByRole('button', { name: /Get Paid/i });
		await fireEvent.click(getPaidButton[0]);

		await waitFor(() => {
			expect(onOpenPaymentRequest).toHaveBeenCalledWith({
				address: '0x2222222222222222222222222222222222222222',
				network: 'usdt-bsc',
				amount: 12.345678,
				memo: 'USDT request',
				chargeFeesToPayer: false,
				totalFees: 0,
				formState: {
					amount: '12.345678',
					unit: 'usd',
					mathExpression: '12.345678',
					memo: 'USDT request',
					selectedNetwork: 'usdt-bsc',
					chargeFeesToPayer: false
				}
			});
		});

		expect(onCancel).toHaveBeenCalled();
	});

	it('fails closed when the BSC wallet is not connected', async () => {
		walletStore.update(() => ({
			hasAnyConnection: true,
			isConnected: true,
			isInitializing: false,
			rsk: {
				connected: true,
				address: '0x1111111111111111111111111111111111111111'
			},
			bsc: {
				connected: false,
				address: null
			}
		}));

		render(ReceivePaymentForm, {
			onCancel,
			onOpenPaymentRequest,
			initialFormState: {
				amount: '4.2',
				unit: 'usd',
				mathExpression: '4.2',
				memo: '',
				selectedNetwork: 'usdt-bsc',
				chargeFeesToPayer: false,
				currentStep: 2
			}
		});

		const getPaidButton = await screen.findAllByRole('button', { name: /Get Paid/i });
		expect(getPaidButton[0]).toBeDisabled();

		expect(onOpenPaymentRequest).not.toHaveBeenCalled();
		expect(mocks.showErrorToast).not.toHaveBeenCalledWith('BSC wallet not connected');
	});

	it('does not require the Rootstock wallet for direct BSC USDT requests', async () => {
		walletStore.update(() => ({
			hasAnyConnection: true,
			isConnected: true,
			isInitializing: false,
			rsk: {
				connected: false,
				address: null
			},
			bsc: {
				connected: true,
				address: '0x2222222222222222222222222222222222222222'
			}
		}));

		render(ReceivePaymentForm, {
			onCancel,
			onOpenPaymentRequest,
			initialFormState: {
				amount: '3.25',
				unit: 'usd',
				mathExpression: '3.25',
				memo: 'BSC only',
				selectedNetwork: 'usdt-bsc',
				chargeFeesToPayer: false,
				currentStep: 2
			}
		});

		const getPaidButton = await screen.findAllByRole('button', { name: /Get Paid/i });
		await fireEvent.click(getPaidButton[0]);

		await waitFor(() => {
			expect(onOpenPaymentRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					address: '0x2222222222222222222222222222222222222222',
					network: 'usdt-bsc',
					amount: 3.25
				})
			);
		});

		expect(mocks.showErrorToast).not.toHaveBeenCalledWith('wallet.rsk_not_connected');
	});

	it('normalizes stale restored USDT-BSC form state back to USD units with no payer-charged fees', async () => {
		render(ReceivePaymentForm, {
			onCancel,
			onOpenPaymentRequest,
			initialFormState: {
				amount: '4.200001',
				unit: 'sats',
				mathExpression: '4.200001',
				memo: 'stale state',
				selectedNetwork: 'usdt-bsc',
				chargeFeesToPayer: true,
				currentStep: 2
			}
		});

		const getPaidButton = await screen.findAllByRole('button', { name: /Get Paid/i });
		await fireEvent.click(getPaidButton[0]);

		await waitFor(() => {
			expect(onOpenPaymentRequest).toHaveBeenCalledWith({
				address: '0x2222222222222222222222222222222222222222',
				network: 'usdt-bsc',
				amount: 4.200001,
				memo: 'stale state',
				chargeFeesToPayer: false,
				totalFees: 0,
				formState: {
					amount: '4.200001',
					unit: 'usd',
					mathExpression: '4.200001',
					memo: 'stale state',
					selectedNetwork: 'usdt-bsc',
					chargeFeesToPayer: false
				}
			});
		});
	});

	it('allows an amountless direct BSC request while keeping the request chain-qualified downstream', async () => {
		render(ReceivePaymentForm, {
			onCancel,
			onOpenPaymentRequest,
			initialFormState: {
				amount: '',
				unit: 'usd',
				mathExpression: '',
				memo: 'Open amount',
				selectedNetwork: 'usdt-bsc',
				chargeFeesToPayer: false,
				currentStep: 2
			}
		});

		const getPaidButton = await screen.findAllByRole('button', { name: /Get Paid/i });
		await fireEvent.click(getPaidButton[0]);

		await waitFor(() => {
			expect(onOpenPaymentRequest).toHaveBeenCalledWith({
				address: '0x2222222222222222222222222222222222222222',
				network: 'usdt-bsc',
				amount: 0,
				memo: 'Open amount',
				chargeFeesToPayer: false,
				totalFees: 0,
				formState: {
					amount: '',
					unit: 'usd',
					mathExpression: '',
					memo: 'Open amount',
					selectedNetwork: 'usdt-bsc',
					chargeFeesToPayer: false
				}
			});
		});

		expect(mocks.showErrorToast).not.toHaveBeenCalledWith(
			'USDT requests support up to 6 decimal places'
		);
	});

	it('keeps the BSC direct request blocked when the amount exceeds 6 decimal places', async () => {
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

		const getPaidButton = await screen.findAllByRole('button', { name: /Get Paid/i });
		expect(getPaidButton[0]).toBeDisabled();

		expect(onOpenPaymentRequest).not.toHaveBeenCalled();
		expect(onCancel).not.toHaveBeenCalled();
		expect(mocks.showErrorToast).not.toHaveBeenCalledWith(
			'USDT requests support up to 6 decimal places'
		);
	});

	it('allows selecting USDT on BSC from the network picker and submitting a direct open-amount request', async () => {
		render(ReceivePaymentForm, {
			onCancel,
			onOpenPaymentRequest
		});

		const lightningNetworkButtons = await screen.findAllByRole('button', {
			name: /Lightning Bitcoin\s*Network/i
		});
		await fireEvent.click(lightningNetworkButtons[0]);

		await waitFor(() => {
			expect(screen.getAllByRole('button', { name: /USDT on BSC\s*Network/i }).length).toBeGreaterThan(0);
		});

		const bscNetworkButtons = screen.getAllByRole('button', { name: /USDT on BSC\s*Network/i });
		await fireEvent.click(bscNetworkButtons[0]);

		const getPaidButtons = await screen.findAllByRole('button', { name: /Get Paid/i });
		await fireEvent.click(getPaidButtons[0]);

		await waitFor(() => {
			expect(onOpenPaymentRequest).toHaveBeenCalledWith({
				address: '0x2222222222222222222222222222222222222222',
				network: 'usdt-bsc',
				amount: 0,
				memo: undefined,
				chargeFeesToPayer: false,
				totalFees: 0,
				formState: {
					amount: '',
					unit: 'usd',
					mathExpression: '',
					memo: '',
					selectedNetwork: 'usdt-bsc',
					chargeFeesToPayer: false
				}
			});
		});

		expect(mocks.showErrorToast).not.toHaveBeenCalled();
	});
});
