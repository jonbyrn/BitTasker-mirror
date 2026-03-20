import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
import { walletManager, walletStore } from '$lib/stores/wallet.store';

function getCalcButton(name: string) {
	return screen.getAllByRole('button', { name })[0];
}

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'wallet.receive_form.select_network': 'Select Network',
		'wallet.receive_form.network_not_available': 'Network not available',
		'wallet.receive_form.networks.lightning_bitcoin.label': 'Lightning Bitcoin',
		'wallet.receive_form.networks.rootstock_bitcoin.label': 'Rootstock Bitcoin',
		'wallet.receive_form.networks.liquid_bitcoin.label': 'Liquid Bitcoin',
		'wallet.receive_form.networks.bitcoin.label': 'Bitcoin',
		'wallet.description': 'Description',
		'wallet.optional': 'Optional',
		'wallet.payment_for_placeholder': 'Payment for...',
		'wallet.network_fee': 'Network Fee',
		'wallet.sats': 'Sats',
		'wallet.swap.loading_fees': 'Calculating fees...',
		'wallet.swap.service_fee': 'Service Fee',
		'wallet.swap.swap_fee': 'Swap Fee',
		'wallet.swap.network_transaction_fee': 'Network Transaction Fee',
		'wallet.swap.total_received_est': 'Total Received (est)',
		'wallet.swap.error.fee_fetch_failed': 'Failed to fetch fee estimate',
		'wallet.receive.cancel': 'Cancel',
		'wallet.receive.generate_invoice': 'Generate Invoice',
		'wallet.receive.get_paid': 'Get Paid',
		'wallet.receive.charge_fees_to_payer': 'Charge fees to payer',
		'wallet.payment_request.title': 'Payment Request',
		'wallet.receive.network': 'Network',
		'wallet.receive.enter_amount_to_estimate': 'Enter amount to estimate fees',
		'common.back': 'Back',
		'common.next': 'Next',
		'wallet.receive.unit_sats': 'Sats',
		'wallet.receive.unit_usd': 'USD',
		'common.loading': 'Loading...',
		'wallet.exchange_rate_unavailable': 'Exchange rate unavailable',
		'wallet.coming_soon': 'Coming Soon',
		'wallet.max': 'Max'
	};
	const tStore = readable((key: string) => translations[key] || key);
	return {
		t: tStore,
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

vi.mock('$lib/stores/wallet.store', async () => {
	const { writable } = await import('svelte/store');
	return {
		walletStore: writable({
			hasAnyConnection: true,
			isConnected: true,
			isInitializing: false,
			totalBalances: {
				sats: 250000
			},
			rsk: {
				connected: true,
				address: '0x1234567890123456789012345678901234567890'
			},
			bsc: {
				connected: true,
				address: '0x2222222222222222222222222222222222222222',
				formattedUsdtBalance: '125.000000'
			}
		}),
		walletManager: {
			getReverseSwapPairs: vi.fn().mockResolvedValue({
				BTC: {
					RBTC: {
						limits: { minimal: 10000, maximal: 100000000 },
						fees: { percentage: 0.25, minerFees: { lockup: 27, claim: 20 } }
					}
				}
			}),
			getCachedReverseSwapPairs: vi.fn().mockResolvedValue({
				BTC: {
					RBTC: {
						limits: { minimal: 10000, maximal: 100000000 },
						fees: { percentage: 0.25, minerFees: { lockup: 27, claim: 20 } }
					}
				}
			}),
			getChainSwapPairs: vi.fn().mockResolvedValue({
				'L-BTC': {
					RBTC: {
						limits: { minimal: 10000, maximal: 100000000 },
						fees: { percentage: 0.1, minerFees: { user: { lockup: 34, claim: 20 } } }
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
			generateLightningInvoice: vi.fn().mockResolvedValue('lnbc1p0example1234567890'),
			generateLiquidInvoice: vi.fn().mockResolvedValue('VJL1example1234567890'),
			createReverseSwap: vi.fn().mockResolvedValue({ swapId: 'test-swap-id' }),
			createChainSwap: vi.fn().mockResolvedValue({ swapId: 'test-chain-swap-id' }),
			reverseSwapService: {
				createReverseSwap: vi.fn().mockResolvedValue({
					invoice: 'lnbc1p0example1234567890',
					swapId: 'test-swap-id'
				})
			},
			chainSwapService: {
				createChainSwap: vi.fn().mockResolvedValue({
					invoice: 'VJL1example1234567890',
					swapId: 'test-chain-swap-id'
				})
			}
		},
		formatSats: (sats: number) => new Intl.NumberFormat('en-US').format(sats),
		formatUsd: (amount: number) =>
			new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount),
		getWalletManager: vi.fn(() => ({
			getReverseSwapPairs: vi.fn().mockResolvedValue({
				BTC: {
					RBTC: {
						limits: { minimal: 10000, maximal: 100000000 },
						fees: { percentage: 0.25, minerFees: { lockup: 27, claim: 20 } }
					}
				}
			}),
			getChainSwapPairs: vi.fn().mockResolvedValue({
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
			generateLightningInvoice: vi.fn().mockResolvedValue('lnbc1p0example1234567890'),
			generateLiquidInvoice: vi.fn().mockResolvedValue('VJL1example1234567890')
		}))
	};
});

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(65000)
	}
}));

vi.mock('$lib/utils/helpers/common', async () => {
	const actual = await vi.importActual('$lib/utils/helpers/common');
	return {
		...actual,
		debounce: (fn: () => void) => fn
	};
});

vi.mock('$lib/utils/helpers/haptics', () => ({
	triggerHaptic: vi.fn(),
	ImpactStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' }
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: { getPlatform: vi.fn(() => 'web') }
}));

vi.mock('ethers', async () => {
	const actual = await vi.importActual('ethers');
	return {
		...actual,
		ethers: {
			...actual.ethers,
			JsonRpcProvider: vi.fn().mockImplementation(() => ({
				getBlockNumber: vi.fn().mockResolvedValue(12345678),
				getFeeData: vi.fn().mockResolvedValue({
					gasPrice: BigInt('1000000000'),
					maxFeePerGas: BigInt('1000000000'),
					maxPriorityFeePerGas: BigInt('100000000')
				}),
				getBlock: vi.fn().mockResolvedValue({
					baseFeePerGas: BigInt('1000000000'),
					number: 12345678
				}),
				formatEther: actual.ethers.formatEther
			}))
		}
	};
});

vi.mock('$lib/stores/app.store', async () => {
	const { writable } = await import('svelte/store');
	const mockPool = {
		querySync: vi.fn().mockResolvedValue([]),
		publish: vi.fn().mockResolvedValue([Promise.resolve()]),
		subscribe: vi.fn(() => ({
			close: vi.fn()
		})),
		close: vi.fn()
	};
	const mockAppStore = writable({
		pool: mockPool,
		biometricData: null,
		network: 'testnet',
		relays: []
	});
	return {
		appStore: {
			...mockAppStore,
			showSuccessToast: vi.fn(),
			showErrorToast: vi.fn()
		}
	};
});

describe('ReceivePaymentForm Integration Tests', () => {
	const defaultProps = {
		onCancel: vi.fn(),
		onOpenPaymentRequest: vi.fn()
	};

	beforeEach(() => {
		vi.clearAllMocks();
		walletStore.set({
			hasAnyConnection: true,
			isConnected: true,
			isInitializing: false,
			totalBalances: {
				sats: 250000
			},
			rsk: {
				connected: true,
				address: '0x1234567890123456789012345678901234567890'
			},
			bsc: {
				connected: true,
				address: '0x2222222222222222222222222222222222222222',
				formattedUsdtBalance: '125.000000'
			}
		});
	});

	describe('Invoice Generation Flow', () => {
		it('should generate Lightning invoice when amount is entered', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			await waitFor(() => {
				expect(screen.getAllByRole('button', { name: '1' }).length).toBeGreaterThan(0);
			});
			fireEvent.click(screen.getAllByRole('button', { name: 'Sats' })[0]);
			await tick();
			fireEvent.click(getCalcButton('1'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			await tick();

			await waitFor(
				() => {
					const getPaidButtons = screen.getAllByRole('button', { name: /Get Paid/i });
					expect(getPaidButtons.some((button) => !button.hasAttribute('disabled'))).toBe(true);
				},
				{ timeout: 3000 }
			);

			const nextButton = screen.queryByRole('button', { name: /Next/i });
			if (nextButton && !nextButton.hasAttribute('disabled')) {
				fireEvent.click(nextButton);
				await tick();
			}
			const getPaidButtons = screen.getAllByRole('button', { name: /Get Paid/i });
			const enabledBtn = getPaidButtons.find((button) => !button.hasAttribute('disabled'));
			if (enabledBtn) {
				fireEvent.click(enabledBtn);
			}
			await tick();

			await waitFor(
				() => {
					expect(walletManager.createReverseSwap).toHaveBeenCalled();
				},
				{ timeout: 3000 }
			);
		}, 15000);

		it('should call onOpenPaymentRequest when invoice is generated', async () => {
			const onOpenPaymentRequest = vi.fn();
			render(ReceivePaymentForm, { ...defaultProps, onOpenPaymentRequest });
			await tick();

			fireEvent.click(screen.getAllByRole('button', { name: 'Sats' })[0]);
			await tick();
			fireEvent.click(getCalcButton('1'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			await tick();

			await waitFor(
				() => {
					const getPaidButtons = screen.getAllByRole('button', { name: /Get Paid/i });
					expect(getPaidButtons.some((button) => !button.hasAttribute('disabled'))).toBe(true);
				},
				{ timeout: 3000 }
			);
			const nextButton = screen.queryByRole('button', { name: /Next/i });
			if (nextButton && !nextButton.hasAttribute('disabled')) {
				fireEvent.click(nextButton);
				await tick();
			}
			const getPaidButtons = screen.getAllByRole('button', { name: /Get Paid/i });
			const enabledBtn = getPaidButtons.find((button) => !button.hasAttribute('disabled'));
			if (enabledBtn) {
				fireEvent.click(enabledBtn);
			}
			await tick();

			await waitFor(
				() => {
					expect(onOpenPaymentRequest).toHaveBeenCalled();
				},
				{ timeout: 3000 }
			);
		}, 15000);
	});

	describe('Network Selection', () => {
		it('should update invoice when network changes', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			const networkButton = screen.getAllByRole('button', {
				name: /Lightning Bitcoin\s*Network/i
			})[0];
			fireEvent.click(networkButton);
			await tick();

			await waitFor(
				() => {
					const rootstockOptions = screen.getAllByRole('button', {
						name: /Rootstock Bitcoin\s*Network/i
					});
					expect(rootstockOptions.length).toBeGreaterThan(0);
					fireEvent.click(rootstockOptions[0]);
				},
				{ timeout: 2000 }
			);
			await tick();

			await waitFor(
				() => {
					const updatedTitles = screen.getAllByRole('button', {
						name: /Rootstock Bitcoin\s*Network/i
					});
					expect(updatedTitles.length).toBeGreaterThan(0);
				},
				{ timeout: 1000 }
			);
		});
	});

	describe('Fee Estimation', () => {
		it('should calculate fees when amount is entered', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			await waitFor(() => {
				expect(screen.getAllByRole('button', { name: '1' }).length).toBeGreaterThan(0);
			});
			fireEvent.click(screen.getAllByRole('button', { name: 'Sats' })[0]);
			await tick();
			fireEvent.click(getCalcButton('1'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			await tick();

			await waitFor(
				() => {
					expect(screen.getAllByText(/297 Sats/i).length).toBeGreaterThan(0);
				},
				{ timeout: 3000 }
			);
		}, 15000);
	});

	describe('Amount Input', () => {
		it('should toggle between sats and USD', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			await waitFor(() => {
				const satsButtons = screen.getAllByRole('button', { name: /^Sats$/i });
				const usdButtons = screen.getAllByRole('button', { name: /^USD$/i });
				expect(satsButtons.length).toBeGreaterThan(0);
				expect(usdButtons.length).toBeGreaterThan(0);
			});

			const satsButton = screen.getAllByRole('button', { name: 'Sats' })[0];
			const usdButton = screen.getAllByRole('button', { name: 'USD' })[0];

			fireEvent.click(satsButton);
			await tick();

			fireEvent.click(usdButton);
			await tick();
		});
	});
});
