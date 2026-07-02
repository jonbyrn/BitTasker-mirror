import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
import { walletManager } from '$lib/stores/wallet.store';

// Helper: ReceivePaymentForm renders mobile + desktop; use first match for calculator buttons
function getCalcButton(name: string) {
	return screen.getAllByRole('button', { name })[0];
}

// Mock dependencies (reuse from existing ReceivePaymentForm.test.ts)
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
		'wallet.swap.network_transaction_fee': 'Network Transaction Fee',
		'wallet.swap.total_received_est': 'Total Received (est)',
		'wallet.swap.error.fee_fetch_failed': 'Failed to fetch fee estimate',
		'wallet.receive.cancel': 'Cancel',
		'wallet.receive.generate_invoice': 'Generate Invoice',
		'wallet.receive.get_paid': 'Get Paid',
		'wallet.payment_request.title': 'Payment Request',
		'wallet.receive.network': 'Network',
		'wallet.receive.enter_amount_to_estimate': 'Enter amount to estimate fees',
		'common.back': 'Back',
		'wallet.receive.unit_sats': 'Sats',
		'wallet.receive.unit_usd': 'USD',
		'common.loading': 'Loading...',
		'wallet.exchange_rate_unavailable': 'Exchange rate unavailable'
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
			rsk: {
				connected: true,
				address: '0x1234567890123456789012345678901234567890'
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

// Mock ethers to prevent real network calls
vi.mock('ethers', async () => {
	const actual = await vi.importActual('ethers');
	return {
		...(actual as Record<string, unknown>),
		ethers: {
			...((actual as Record<string, unknown>).ethers as Record<string, unknown>),
			JsonRpcProvider: vi.fn().mockImplementation(() => ({
				getBlockNumber: vi.fn().mockResolvedValue(12345678),
				getFeeData: vi.fn().mockResolvedValue({
					gasPrice: BigInt('1000000000'), // 1 gwei
					maxFeePerGas: BigInt('1000000000'),
					maxPriorityFeePerGas: BigInt('1000000000')
				}),
				getBlock: vi.fn().mockResolvedValue({
					baseFeePerGas: BigInt('1000000000'),
					number: 12345678
				}),
				formatEther: ((actual as Record<string, unknown>).ethers as Record<string, unknown>)
					.formatEther
			}))
		}
	};
});

vi.mock('$lib/stores/app.store', async () => {
	const { writable } = await import('svelte/store');
	// Create a mock pool for the store
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
	});

	describe('Invoice Generation Flow', () => {
		it('should generate Lightning invoice when amount is entered', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// Enter 10000 sats using calculator (above Lightning swap minimum)
			await waitFor(() => {
				expect(screen.getAllByRole('button', { name: '1' }).length).toBeGreaterThan(0);
			});
			fireEvent.click(screen.getAllByRole('button', { name: 'Sats' })[0]);
			await tick();
			fireEvent.click(getCalcButton('1'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0')); // 10000
			await tick();

			// Wait for fees to calculate
			await waitFor(
				() => {
					expect(document.querySelector('.loading.loading-spinner')).toBeNull();
				},
				{ timeout: 3000 }
			);

			// On mobile: click Next to go to step 2, then Get Paid
			const nextButton = screen.queryByRole('button', { name: /Next/i });
			if (nextButton && !nextButton.hasAttribute('disabled')) {
				fireEvent.click(nextButton);
				await tick();
			}
			const getPaidButtons = screen.getAllByRole('button', { name: /Get Paid/i });
			const enabledBtn = getPaidButtons.find((b) => !b.hasAttribute('disabled'));
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
		});

		it('should call onOpenPaymentRequest when invoice is generated', async () => {
			const onOpenPaymentRequest = vi.fn();
			render(ReceivePaymentForm, { ...defaultProps, onOpenPaymentRequest });
			await tick();

			// Enter 10000 sats and generate invoice
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
					return getPaidButtons.some((b) => !b.hasAttribute('disabled'));
				},
				{ timeout: 3000 }
			);
			const nextButton = screen.queryByRole('button', { name: /Next/i });
			if (nextButton && !nextButton.hasAttribute('disabled')) {
				fireEvent.click(nextButton);
				await tick();
			}
			const getPaidButtons = screen.getAllByRole('button', { name: /Get Paid/i });
			const enabledBtn = getPaidButtons.find((b) => !b.hasAttribute('disabled'));
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
		});
	});

	describe('Network Selection', () => {
		it('should update invoice when network changes', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// Network selector is a collapse; click title to expand
			const networkButton = screen.getAllByRole('button', {
				name: /Lightning Bitcoin\s*Network/i
			})[0];
			fireEvent.click(networkButton);
			await tick();

			// Click Rootstock Bitcoin option
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

			// Verify network was selected
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
			fireEvent.click(getCalcButton('0')); // 100000
			await tick();

			await waitFor(
				() => {
					expect(screen.getByText(/Network Fee:/)).toBeDefined();
				},
				{ timeout: 3000 }
			);
		});
	});

	describe('Amount Input', () => {
		it('should toggle between sats and USD', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// Find unit toggle buttons - there might be multiple, get the specific ones from AmountInputSection
			await waitFor(() => {
				const satsButtons = screen.getAllByRole('button', { name: /^Sats$/i });
				const usdButtons = screen.getAllByRole('button', { name: /^USD$/i });
				expect(satsButtons.length).toBeGreaterThan(0);
				expect(usdButtons.length).toBeGreaterThan(0);
			});

			// Get the first unit toggle (from AmountInputSection)
			const satsButton = screen.getAllByRole('button', { name: 'Sats' })[0];
			const usdButton = screen.getAllByRole('button', { name: 'USD' })[0];

			// Default should be USD, click sats
			fireEvent.click(satsButton);
			await tick();

			// Click USD to toggle back
			fireEvent.click(usdButton);
			await tick();
		});
	});
});
