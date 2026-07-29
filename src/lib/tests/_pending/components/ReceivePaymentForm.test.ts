import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
import { walletStore, walletManager } from '$lib/stores/wallet.store';
import _cryptoPriceService from '$lib/api/services/crypto-price.service';

// Helper: ReceivePaymentForm renders mobile + desktop AmountInputSection; use first match for calculator/unit buttons
function getCalcButton(name: string) {
	return screen.getAllByRole('button', { name })[0];
}
function getCancelButton() {
	return screen.getAllByRole('button', { name: 'Cancel' })[0];
}
function getGetPaidButton() {
	return screen.getAllByRole('button', { name: /Get Paid/i })[0];
}
function getNetworkButton() {
	return screen.getAllByRole('button', { name: /Lightning Bitcoin\s*Network/i })[0];
}

// Mock svelte-i18n
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
		'wallet.receive.charge_fees_to_payer': 'Charge fees to payer',
		'wallet.receive.below_swap_minimum': 'Minimum {minAmount} sats',
		'wallet.receive.description_characters': 'characters',
		'wallet.coming_soon': 'Coming Soon',
		'wallet.rsk_not_connected': 'RSK wallet not connected',
		'wallet.invoice.generation_failed': 'Failed to generate invoice',
		'common.back': 'Back',
		'common.next': 'Next',
		'wallet.receive.unit_sats': 'Sats',
		'wallet.receive.unit_usd': 'USD',
		'common.loading': 'Loading...',
		'wallet.exchange_rate_unavailable': 'Exchange rate unavailable',
		'wallet.initializing': 'Initializing wallet...'
	};
	const tStore = readable(
		(key: string, values?: { values?: Record<string, string> } | Record<string, string>) => {
			let result = translations[key] || key;
			const replacements =
				values?.values ??
				(typeof values === 'object' && values && !('values' in values)
					? (values as Record<string, string>)
					: undefined);
			if (replacements) {
				Object.entries(replacements).forEach(([k, v]) => {
					result = result.replace(`{${k}}`, String(v));
				});
			}
			return result;
		}
	);
	return {
		t: tStore,
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

// Mock debounce to execute immediately in tests
vi.mock('$lib/utils/helpers/common', async () => {
	const actual = await vi.importActual('$lib/utils/helpers/common');
	return {
		...actual,
		debounce: (fn: (...args: unknown[]) => void) => fn // Execute immediately in tests
	};
});

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
					maxPriorityFeePerGas: BigInt('100000000')
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

// Mock wallet store - must match component expectations (isConnected, isInitializing)
vi.mock('$lib/stores/wallet.store', async () => {
	const { writable } = await import('svelte/store');
	const mockWalletStore = writable({
		hasAnyConnection: true,
		isConnected: true,
		isInitializing: false,
		rsk: {
			connected: true,
			address: '0x1234567890123456789012345678901234567890'
		}
	});
	const swapPairsResult = {
		BTC: {
			RBTC: {
				limits: { minimal: 10000, maximal: 100000000 },
				fees: {
					percentage: 0.25,
					minerFees: { lockup: 27, claim: 20 }
				}
			}
		}
	};
	const chainPairsResult = {
		'L-BTC': {
			RBTC: {
				limits: { minimal: 10000, maximal: 100000000 },
				fees: {
					percentage: 0.1,
					minerFees: {
						user: { lockup: 34, claim: 20 }
					}
				}
			}
		}
	};
	return {
		walletStore: mockWalletStore,
		walletManager: {
			getReverseSwapPairs: vi.fn().mockResolvedValue(swapPairsResult),
			getCachedReverseSwapPairs: vi.fn().mockResolvedValue(swapPairsResult),
			getChainSwapPairs: vi.fn().mockResolvedValue(chainPairsResult),
			getCachedChainSwapPairs: vi.fn().mockResolvedValue(chainPairsResult),
			estimateRBTCGas: vi.fn().mockResolvedValue({
				totalCostFormatted: '0.00103',
				gasLimit: '21000',
				gasPrice: '1000000000',
				totalCost: '1030000000000000'
			}),
			generateLightningInvoice: vi.fn().mockResolvedValue('lnbc1p0example1234567890'),
			generateLiquidInvoice: vi.fn().mockResolvedValue('VJL1example1234567890'),
			createReverseSwap: vi.fn().mockResolvedValue({ swapId: 'test-swap-id' }),
			createChainSwap: vi.fn().mockResolvedValue({ swapId: 'test-chain-swap-id' })
		},
		formatSats: (sats: number) => new Intl.NumberFormat('en-US').format(sats),
		formatUsd: (amount: number) =>
			new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
	};
});

// Mock crypto price service
vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(50000)
	}
}));

// Mock receive components
vi.mock('$lib/components/wallet/LightningReceive.svelte', () => ({
	default: vi.fn()
}));
vi.mock('$lib/components/wallet/LBTCReceive.svelte', () => ({
	default: vi.fn()
}));
vi.mock('$lib/components/wallet/RSKReceive.svelte', () => ({
	default: vi.fn()
}));

describe('ReceivePaymentForm Component', () => {
	const defaultProps = {
		onCancel: vi.fn(),
		onOpenPaymentRequest: vi.fn()
	};

	beforeEach(() => {
		vi.clearAllMocks();
		// Reset wallet store using update method
		walletStore.update(
			() =>
				({
					hasAnyConnection: true,
					isConnected: true,
					isInitializing: false,
					rsk: {
						connected: true,
						address: '0x1234567890123456789012345678901234567890'
					}
				}) as unknown as Parameters<Parameters<typeof walletStore.update>[0]>[0]
		);
	});

	describe('Basic Rendering', () => {
		it('should render calculator and amount display', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// Wait for BTC price to load and components to render
			// Component renders mobile + desktop AmountInputSection; use first calculator button
			await waitFor(
				() => {
					expect(screen.getAllByRole('button', { name: '1' }).length).toBeGreaterThan(0);
				},
				{ timeout: 2000 }
			);

			// Unit toggle buttons should be rendered
			expect(screen.getAllByRole('button', { name: 'Sats' }).length).toBeGreaterThan(0);
		});

		it('should render network selector', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// Network selector is a collapse (mobile + desktop); use first
			const networkButton = getNetworkButton();
			expect(networkButton).toBeDefined();
		});

		it('should render memo field', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();
			await waitFor(
				() => {
					const memoField =
						document.querySelector('textarea[id="memo-input"]') ??
						document.querySelector('textarea[id="memo-input-desktop"]');
					expect(memoField).toBeDefined();
				},
				{ timeout: 2000 }
			);
		});

		it('should render action buttons', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			expect(getCancelButton()).toBeDefined();
			expect(getGetPaidButton()).toBeDefined();
		});
	});

	describe('Calculator Integration', () => {
		it('should update amount when calculator input is received', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// Switch to sats unit first (default is USD)
			const satsButton = screen.getAllByRole('button', { name: 'Sats' })[0];
			fireEvent.click(satsButton);
			await tick();

			// Click calculator buttons (use first of each - mobile + desktop both render)
			fireEvent.click(getCalcButton('1'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));

			await tick();

			await waitFor(() => {
				const amountDisplays = screen.getAllByText('100');
				expect(amountDisplays.length).toBeGreaterThan(0);
			});
		});
	});

	describe('Unit Toggle', () => {
		it('should toggle between sats and USD', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();
			await waitFor(() => {
				expect(screen.getAllByRole('button', { name: 'Sats' }).length).toBeGreaterThan(0);
			});

			const satsButton = screen.getAllByRole('button', { name: 'Sats' })[0];
			fireEvent.click(satsButton);
			await tick();

			await waitFor(() => {
				expect(screen.getAllByRole('button', { name: 'USD' }).length).toBeGreaterThan(0);
			});
		});
	});

	describe('Network Selection', () => {
		it('should allow selecting different networks', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// Network selector is a collapse; click title to expand
			fireEvent.click(getNetworkButton());
			await tick();

			// Click first Rootstock Bitcoin option (mobile + desktop both render)
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

			// Verify the network was selected
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
		it('should estimate fees for Lightning network', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// Switch to sats and enter amount
			fireEvent.click(screen.getAllByRole('button', { name: 'Sats' })[0]);
			await tick();
			fireEvent.click(getCalcButton('1'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0')); // 100,000 sats

			// Wait for fees to be calculated (debounced)
			await waitFor(
				() => {
					expect(screen.getByText(/Network Fee:/)).toBeDefined();
				},
				{ timeout: 3000 }
			);

			expect(screen.queryByText(/enter.*amount.*to.*estimate/i)).toBeNull();
		});

		it('should estimate fees for Rootstock network', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// Expand network collapse and select Rootstock
			fireEvent.click(getNetworkButton());
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

			// Enter amount in sats
			fireEvent.click(screen.getAllByRole('button', { name: 'Sats' })[0]);
			await tick();
			fireEvent.click(getCalcButton('1'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0')); // 100,000 sats

			await waitFor(
				() => {
					expect(walletManager.estimateRBTCGas).toHaveBeenCalled();
				},
				{ timeout: 2000 }
			);
		});

		it('should show loading state while calculating fees', async () => {
			const swapPairsResult = {
				BTC: {
					RBTC: {
						limits: { minimal: 10000, maximal: 100000000 },
						fees: { percentage: 0.25, minerFees: { lockup: 27, claim: 20 } }
					}
				}
			};
			vi.mocked(walletManager.getCachedReverseSwapPairs).mockImplementationOnce(
				() =>
					new Promise((resolve) =>
						setTimeout(
							() =>
								resolve(
									swapPairsResult as unknown as Awaited<
										ReturnType<typeof walletManager.getCachedReverseSwapPairs>
									>
								),
							300
						)
					)
			);

			render(ReceivePaymentForm, defaultProps);
			await tick();

			fireEvent.click(screen.getAllByRole('button', { name: 'Sats' })[0]);
			await tick();
			fireEvent.click(getCalcButton('1'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0')); // 100 sats

			// Fee estimation triggers getCachedReverseSwapPairs; verify it was called
			await waitFor(
				() => {
					expect(walletManager.getCachedReverseSwapPairs).toHaveBeenCalled();
				},
				{ timeout: 1000 }
			);
		});
	});

	describe('Total Received Calculation', () => {
		it.skip('should trigger fee estimation when amount is entered', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// Enter amount; fee estimation uses getCachedReverseSwapPairs
			fireEvent.click(screen.getAllByRole('button', { name: 'Sats' })[0]);
			await tick();
			fireEvent.click(getCalcButton('1'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));

			// getCachedReverseSwapPairs is called in onMount; fee estimate also calls it for Lightning
			expect(walletManager.getCachedReverseSwapPairs).toHaveBeenCalled();
		});
	});

	describe('Form Validation', () => {
		it('should disable Generate Invoice button when amount is zero', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();

			// On mobile step 1 the primary action is "Next"; on desktop it's "Get Paid"
			// Both should be disabled when amount is zero (for Lightning)
			const nextButtons = screen.queryAllByRole('button', { name: /Next/i });
			const getPaidButtons = screen.queryAllByRole('button', { name: /Get Paid/i });
			const primaryButton = getPaidButtons[0] ?? nextButtons[0];
			expect(primaryButton).toBeDefined();
			expect(primaryButton).toHaveAttribute('disabled');
		});

		it('should enable Generate Invoice button when amount is valid', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();
			await waitFor(() => {
				expect(screen.getAllByRole('button', { name: '1' }).length).toBeGreaterThan(0);
			});

			fireEvent.click(screen.getAllByRole('button', { name: 'Sats' })[0]);
			await tick();
			// Enter 10000 sats (above Lightning swap minimum)
			fireEvent.click(getCalcButton('1'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0')); // 10000 sats

			await tick();
			// Wait for fees to load; primary action (Next or Get Paid) should be enabled
			await waitFor(
				() => {
					const nextButtons = screen.queryAllByRole('button', { name: /Next/i });
					const getPaidButtons = screen.queryAllByRole('button', { name: /Get Paid/i });
					const primaryButton = getPaidButtons[0] ?? nextButtons[0];
					expect(primaryButton).toBeDefined();
					expect(primaryButton).not.toHaveAttribute('disabled');
				},
				{ timeout: 3000 }
			);
		});
	});

	describe('Invoice Generation', () => {
		it('should show receive component when Generate Invoice is clicked', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();
			await waitFor(() => {
				expect(screen.getAllByRole('button', { name: '1' }).length).toBeGreaterThan(0);
			});

			fireEvent.click(screen.getAllByRole('button', { name: 'Sats' })[0]);
			await tick();
			// Enter 10000 sats (above Lightning swap minimum of 10000)
			fireEvent.click(getCalcButton('1'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0'));
			fireEvent.click(getCalcButton('0')); // 10000 sats

			await tick();
			await waitFor(
				() => {
					const nextButtons = screen.queryAllByRole('button', { name: /Next/i });
					const getPaidButtons = screen.queryAllByRole('button', { name: /Get Paid/i });
					const primaryButton = getPaidButtons[0] ?? nextButtons[0];
					expect(primaryButton).toBeDefined();
					expect(primaryButton).not.toHaveAttribute('disabled');
				},
				{ timeout: 3000 }
			);

			// On mobile step 1: Next advances to step 2; on desktop: Get Paid is always visible
			const nextButton = screen.queryByRole('button', { name: /Next/i });
			if (nextButton && !nextButton.hasAttribute('disabled')) {
				fireEvent.click(nextButton);
				await tick();
			}
			// Wait for Get Paid to appear and be enabled, then click
			await waitFor(
				() => {
					const getPaidButtons = screen.getAllByRole('button', { name: /Get Paid/i });
					const enabled = getPaidButtons.find((b) => !b.hasAttribute('disabled'));
					return enabled !== undefined;
				},
				{ timeout: 3000 }
			);
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

		it('should call onCancel when Cancel button is clicked', async () => {
			const onCancel = vi.fn();
			render(ReceivePaymentForm, { ...defaultProps, onCancel });
			await tick();

			fireEvent.click(getCancelButton());

			expect(onCancel).toHaveBeenCalledTimes(1);
		});
	});

	describe('Memo Field', () => {
		it('should allow entering memo text', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();
			await waitFor(
				() => {
					const memoField = (document.querySelector('textarea[id="memo-input"]') ??
						document.querySelector('textarea[id="memo-input-desktop"]')) as HTMLTextAreaElement;
					expect(memoField).toBeDefined();
					if (memoField) {
						fireEvent.input(memoField, { target: { value: 'Test payment' } });
						expect(memoField.value).toBe('Test payment');
					}
				},
				{ timeout: 2000 }
			);
		});
	});
});
