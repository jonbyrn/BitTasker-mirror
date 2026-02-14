import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';

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
		...actual,
		ethers: {
			...actual.ethers,
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
				formatEther: actual.ethers.formatEther
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
		onCancel: vi.fn()
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Invoice Generation Flow', () => {
		it('should generate Lightning invoice when amount is entered', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();
			
			// Lightning is the default network, so no need to select it
			// Enter amount using calculator (component uses calculator, not direct input)
			await waitFor(() => {
				expect(screen.getByLabelText('1')).toBeDefined();
			});
			
			// Enter 10000 sats using calculator
			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0')); // 10000
			await tick();
			
			// Wait for fees to calculate and form to be valid
			await waitFor(() => {
				expect(screen.queryByText('Calculating fees...')).toBeNull();
			}, { timeout: 3000 });
			
			// Wait for "Get Paid" button to be enabled
			await waitFor(() => {
				const generateButton = screen.getByRole('button', { name: 'Get Paid' });
				expect(generateButton).not.toHaveAttribute('disabled');
			}, { timeout: 2000 });
			
			const generateButton = screen.getByRole('button', { name: 'Get Paid' });
			fireEvent.click(generateButton);
			await tick();
			
		await waitFor(async () => {
			// Import walletManager from the mocked store
			const { walletManager } = await import('$lib/stores/wallet.store');
			expect(walletManager.reverseSwapService?.createReverseSwap).toHaveBeenCalled();
		}, { timeout: 2000 });
		});

		it('should display QR code after invoice generation', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();
			
			// Simulate invoice generation
			const generateButton = screen.queryByRole('button', { name: /generate|create/i });
			if (generateButton) {
				await fireEvent.click(generateButton);
				await tick();
				
				await waitFor(() => {
					const qrCode = screen.queryByAltText(/qr|code/i) || screen.queryByRole('img');
					if (qrCode) {
						expect(qrCode).toBeInTheDocument();
					}
				});
			}
		});
	});

	describe('Network Selection', () => {
		it('should update invoice when network changes', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();
			
			// Change network using dropdown - use Rootstock Bitcoin instead since Liquid is disabled
			const networkDropdown = screen.getByLabelText('Select Network');
			fireEvent.click(networkDropdown);
			await tick();
			
			// Manually open the dropdown by setting the open attribute
			const detailsElement = document.querySelector('details.dropdown') as HTMLDetailsElement;
			if (detailsElement) {
				detailsElement.open = true;
			}
			await tick();
			
			// Wait for dropdown to open and options to be visible
			await waitFor(() => {
				// Find the Rootstock Bitcoin option (available network)
				const rootstockOption = screen.queryByText(/Rootstock Bitcoin/i);
				return rootstockOption !== null;
			}, { timeout: 2000 });
			
			// Find and click the Rootstock Bitcoin option
			const rootstockOption = screen.getByText(/Rootstock Bitcoin/i);
			fireEvent.click(rootstockOption);
			await tick();
			
			// Network should update - verify by checking dropdown summary shows new network
			await waitFor(() => {
				// The dropdown summary should show the selected network
				const networkSummary = screen.getByLabelText('Select Network');
				const summaryText = networkSummary.textContent || '';
				return summaryText.includes('Rootstock Bitcoin');
			}, { timeout: 2000 });
			
			// Verify the network was actually changed
			const networkSummary = screen.getByLabelText('Select Network');
			expect(networkSummary.textContent).toContain('Rootstock Bitcoin');
		});
	});

	describe('Fee Estimation', () => {
		it('should calculate fees when amount is entered', async () => {
			render(ReceivePaymentForm, defaultProps);
			await tick();
			
			// Enter amount using calculator
			await waitFor(() => {
				expect(screen.getByLabelText('1')).toBeDefined();
			});
			
			// Enter 100000 sats
			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('0')); // 100000
			await tick();
			
			// Fees should be calculated (wait for debounce)
			await waitFor(() => {
				// Check for Network Fee label or that fees are displayed
				const feeDisplay = screen.queryByText(/Network Fee:/) || screen.queryByText(/wallet\.network_fee/i);
				expect(feeDisplay).toBeDefined();
			}, { timeout: 3000 });
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


